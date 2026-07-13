import { useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { fetchProfile } from "@/lib/session-api.js";
import {
  startExpedienteCollab,
  stopExpedienteCollab,
  updateExpedienteCollabTrack,
  findSectionLocker,
  isExpedienteUuid,
} from "@/lib/expediente-collab.js";

/**
 * Presencia + sync de un expediente. Un canal por prospectId.
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

  const myId = profile?.id || null;
  const lockedBy = useMemo(
    () => findSectionLocker(peers, myId, section),
    [peers, myId, section],
  );
  const sectionLocked = !!lockedBy;
  const trackState = wantEdit && !sectionLocked ? "editing" : "viewing";

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
    // Solo re-suscribir al cambiar expediente/perfil — no al cambiar trackState.
  }, [canCollab, prospectId, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!canCollab || !profile?.id) return;
    updateExpedienteCollabTrack({ section, state: trackState }).catch(() => {});
  }, [canCollab, prospectId, profile?.id, section, trackState]);

  const otherPeers = useMemo(
    () => (peers || []).filter((p) => p.user_id !== myId),
    [peers, myId],
  );

  return {
    peers: otherPeers,
    allPeers: peers,
    myId,
    lockedBy,
    sectionLocked,
    trackState,
    hasOthers: otherPeers.length > 0,
  };
}
