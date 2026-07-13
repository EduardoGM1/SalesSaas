import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { fetchProfile } from "@/lib/session-api.js";
import {
  startExpedienteCollab,
  stopExpedienteCollab,
  updateExpedienteCollabTrack,
  setFocusedField,
  findSectionLocker,
  findFieldLocker,
  isExpedienteUuid,
  FIELD_LOCK_TTL_MS,
} from "@/lib/expediente-collab.js";

/**
 * Presencia + sync + field lock de un expediente.
 */
export function useExpedienteCollab({
  prospectId,
  section = "detail",
  wantEdit = false,
  enabled = true,
  onDataChange,
}) {
  const [peers, setPeers] = useState([]);
  const [profile, setProfile] = useState(null);
  const [tick, setTick] = useState(0);
  const [myFocusedField, setMyFocusedField] = useState(null);
  const canCollab = enabled && isSupabaseConfigured() && isExpedienteUuid(prospectId);
  const onDataChangeRef = useRef(onDataChange);
  onDataChangeRef.current = onDataChange;

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

  // Re-evaluar TTL de locks de campo periódicamente
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
  // Soft-lock informativo (banner); no bloquea el formulario — eso lo hace field lock.
  const sectionLocked = !!lockedBy;
  const trackState = wantEdit ? "editing" : "viewing";

  useEffect(() => {
    if (!canCollab || !profile?.id) return undefined;

    let cancelled = false;
    startExpedienteCollab({
      prospectId,
      profile,
      section,
      state: trackState,
      onPeers: (list) => {
        if (!cancelled) setPeers(list);
      },
      onDataChange: (payload) => onDataChangeRef.current?.(payload),
    }).catch(() => {});

    return () => {
      cancelled = true;
      stopExpedienteCollab().catch(() => {});
    };
  }, [canCollab, prospectId, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!canCollab || !profile?.id) return;
    updateExpedienteCollabTrack({ section, state: trackState }).catch(() => {});
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
    return findFieldLocker(peers, myId, fieldId);
  }, [peers, myId, tick]);

  return {
    peers: otherPeers,
    allPeers: peers,
    myId,
    lockedBy,
    sectionLocked,
    trackState,
    hasOthers: otherPeers.length > 0,
    myFocusedField,
    lockField,
    unlockField,
    getFieldLocker,
    fieldLockTtlMs: FIELD_LOCK_TTL_MS,
  };
}

/**
 * Props de bloqueo para un input concreto (mismo Presence que avatares).
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
