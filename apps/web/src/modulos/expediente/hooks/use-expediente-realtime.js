/**
 * Hook unificado de colaboración por expediente.
 * Presence → peers | Broadcast → field locks | Changes → data + toast
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { fetchProfile } from "@/lib/session-api.js";
import {
  subscribeExpedienteRealtime,
  updateExpedienteTrack,
  setFocusedField,
  getMyFocusedField,
  findFieldLocker,
  findSectionLocker,
  isExpedienteUuid,
  FIELD_LOCK_TTL_MS,
} from "@/lib/expediente-realtime.js";
import { notifyRemoteSectionUpdated, wasLocalToolSaveRecent } from "@/lib/collab-remote-notify.js";
import { useI18n } from "@/hooks/use-i18n.js";

/**
 * @param {{
 *   prospectId: string|null|undefined,
 *   section?: string,
 *   wantEdit?: boolean,
 *   enabled?: boolean,
 *   onToolChange?: (payload: object) => void,
 *   onProspectChange?: (payload: object) => void,
 *   toastOnToolUpdate?: boolean,
 * }} opts
 */
export function useExpedienteRealtime({
  prospectId,
  section = "detail",
  wantEdit = false,
  enabled = true,
  onToolChange,
  onProspectChange,
  toastOnToolUpdate = true,
} = {}) {
  const { t } = useI18n();
  const [peers, setPeers] = useState([]);
  const [locks, setLocks] = useState([]);
  const [profile, setProfile] = useState(null);
  const [myFocusedField, setMyFocusedField] = useState(null);
  const [tick, setTick] = useState(0);
  const [toolsRevision, setToolsRevision] = useState(0);
  const [lastRemoteTool, setLastRemoteTool] = useState(null);

  const canCollab = enabled && isSupabaseConfigured() && isExpedienteUuid(prospectId);
  const onToolChangeRef = useRef(onToolChange);
  const onProspectChangeRef = useRef(onProspectChange);
  const sectionRef = useRef(section);
  onToolChangeRef.current = onToolChange;
  onProspectChangeRef.current = onProspectChange;
  sectionRef.current = section;

  useEffect(() => {
    if (!canCollab) return undefined;
    let active = true;
    fetchProfile()
      .then((p) => {
        if (active && p?.id) setProfile(p);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [canCollab]);

  // TTL de locks: re-render periódico para caducar locks huérfanos en UI
  useEffect(() => {
    if (!canCollab) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, [canCollab]);

  const myId = profile?.id || null;
  const lockedBy = useMemo(
    () => findSectionLocker(peers, myId, section),
    [peers, myId, section],
  );
  const sectionLocked = !!lockedBy;
  const trackState = wantEdit ? "editing" : "viewing";

  useEffect(() => {
    if (!canCollab || !profile?.id) return undefined;

    const unsub = subscribeExpedienteRealtime({
      prospectId,
      profile,
      section,
      state: trackState,
      onPeers: (list) => setPeers(list || []),
      onLocks: (list) => setLocks(list || []),
      onDataChange: (payload) => {
        if (payload?.table === "tool_calculations" && payload.tool) {
          const localEcho = wasLocalToolSaveRecent(prospectId, payload.tool);
          if (!localEcho) {
            setLastRemoteTool({
              tool: payload.tool,
              data: payload.data ?? null,
              eventId: payload.eventId,
              commit_timestamp: payload.commit_timestamp,
            });
            setToolsRevision((n) => n + 1);
            onToolChangeRef.current?.(payload);
            if (toastOnToolUpdate && payload.tool === sectionRef.current) {
              notifyRemoteSectionUpdated({
                prospectId,
                tool: payload.tool,
                message: t("collab.remoteUpdated"),
                eventId: payload.eventId || `${payload.tool}:${payload.commit_timestamp}`,
                source: "expediente-realtime",
              });
            }
          } else {
            // Eco propio: igual notificar al session por si necesita sync interno, sin toast.
            onToolChangeRef.current?.({ ...payload, localEcho: true });
          }
          return;
        }
        if (payload?.table === "prospects") {
          onProspectChangeRef.current?.(payload);
        }
      },
    });

    return () => {
      unsub();
    };
  }, [canCollab, prospectId, profile?.id, toastOnToolUpdate, t]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!canCollab || !profile?.id) return;
    updateExpedienteTrack({ section, state: trackState }).catch(() => {});
  }, [canCollab, prospectId, profile?.id, section, trackState]);

  const otherPeers = useMemo(
    () => (peers || []).filter((p) => p.user_id !== myId),
    [peers, myId],
  );

  const lockField = useCallback(async (fieldId) => {
    setMyFocusedField(fieldId || null);
    await setFocusedField(fieldId || null);
  }, []);

  const unlockField = useCallback(async () => {
    setMyFocusedField(null);
    await setFocusedField(null);
  }, []);

  const getFieldLocker = useCallback((fieldId) => {
    void tick;
    return findFieldLocker(locks, myId, fieldId);
  }, [locks, myId, tick]);

  return {
    peers: otherPeers,
    allPeers: peers,
    myId,
    lockedBy,
    sectionLocked,
    trackState,
    hasOthers: otherPeers.length > 0,
    myFocusedField: myFocusedField ?? getMyFocusedField(),
    lockField,
    unlockField,
    getFieldLocker,
    fieldLocks: locks,
    fieldLockTtlMs: FIELD_LOCK_TTL_MS,
    toolsRevision,
    lastRemoteTool,
  };
}

/** Compat: nombre anterior del hook. */
export const useExpedienteCollab = useExpedienteRealtime;

/**
 * Props de bloqueo para un input (locks vía Broadcast).
 */
export function useFieldLock(collab, fieldId, { disabled = false, onEditStart } = {}) {
  const locker = collab?.getFieldLocker?.(fieldId) || null;
  const locked = !!locker && !disabled;

  const onFocus = useCallback(() => {
    if (disabled || locked) return;
    onEditStart?.();
    collab?.lockField?.(fieldId);
  }, [collab, fieldId, disabled, locked, onEditStart]);

  const onBlur = useCallback(() => {
    if (disabled) return;
    collab?.unlockField?.();
  }, [collab, disabled]);

  return {
    locked,
    locker,
    lockProps: {
      onFocus,
      onBlur,
      readOnly: disabled || locked,
      disabled: disabled || locked,
      "aria-disabled": disabled || locked ? "true" : undefined,
      className: locked ? "collab-field-locked" : undefined,
    },
  };
}
