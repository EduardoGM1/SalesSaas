import { useCallback, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { fetchProfile } from "@/lib/session-api.js";
import {
  startExpedienteCollab,
  stopExpedienteCollab,
  updateExpedienteCollabTrack,
  findSectionLocker,
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

  useEffect(() => {
    if (!enabled || !isSupabaseConfigured()) return undefined;
    let active = true;
    fetchProfile()
      .then((p) => {
        if (active && p?.id) setProfile(p);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [enabled]);

  const myId = profile?.id || null;
  const lockedBy = useMemo(
    () => findSectionLocker(peers, myId, section),
    [peers, myId, section],
  );
  const sectionLocked = !!lockedBy;
  const trackState = wantEdit && !sectionLocked ? "editing" : "viewing";

  useEffect(() => {
    if (!enabled || !isSupabaseConfigured() || !prospectId || !profile?.id) {
      return undefined;
    }

    startExpedienteCollab({
      prospectId,
      profile,
      section,
      state: trackState,
      onPeers: setPeers,
      onDataChange,
    }).catch(() => {});

    return () => {
      stopExpedienteCollab().catch(() => {});
    };
  }, [enabled, prospectId, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled || !prospectId || !profile?.id) return;
    updateExpedienteCollabTrack({ section, state: trackState }).catch(() => {});
  }, [enabled, prospectId, profile?.id, section, trackState]);

  const otherPeers = useMemo(
    () => (peers || []).filter((p) => p.user_id !== myId),
    [peers, myId],
  );

  const refreshPeers = useCallback(() => {
    // presence sync pushes via onPeers; no-op helper for callers
  }, []);

  return {
    peers: otherPeers,
    allPeers: peers,
    myId,
    lockedBy,
    sectionLocked,
    trackState,
    refreshPeers,
  };
}
