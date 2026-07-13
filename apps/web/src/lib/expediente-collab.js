/**
 * Colaboración por expediente:
 * - Presence (privado): expediente:{prospectId} — peers + focused_field
 * - Postgres Changes (público): expediente-data:{prospectId}
 */
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, primeRealtimeAuth } from "@/lib/supabase/client";
import { fetchRealtimeSession } from "@/lib/presence-api.js";
import { ensureRealtimeReady, removeChannelSafe } from "@/lib/presence/realtime.js";

const DEBOUNCE_MS = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Locks de campo más viejos que esto se ignoran en clientes (desconexión / stale). */
export const FIELD_LOCK_TTL_MS = 60_000;

let presenceChannel = null;
let dataChannel = null;
let activeProspectId = null;
let presenceJoined = false;
let dataJoined = false;
let debounceTimer = null;
let onPeersCb = null;
let onDataChangeCb = null;
let lastTrack = null;
let pagehideBound = false;
let opGeneration = 0;
let opChain = Promise.resolve();
const recentEventKeys = new Map();
let focusHeartbeatTimer = null;

export function expedienteTopic(prospectId) {
  return `expediente:${prospectId}`;
}

export function expedienteDataTopic(prospectId) {
  return `expediente-data:${prospectId}`;
}

export function isExpedienteUuid(id) {
  return typeof id === "string" && UUID_RE.test(id);
}

async function ensureBrowserSession(supabase) {
  let { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) return session;
  try {
    const rt = await fetchRealtimeSession();
    const { error } = await supabase.auth.setSession({
      access_token: rt.access_token,
      refresh_token: rt.refresh_token,
    });
    if (error) return null;
    ({ data: { session } } = await supabase.auth.getSession());
    if (session?.access_token) primeRealtimeAuth(session.access_token);
    return session;
  } catch {
    return null;
  }
}

function presenceListToPeers(ch) {
  if (!ch) return [];
  const state = ch.presenceState?.() || {};
  const peers = [];
  for (const key of Object.keys(state)) {
    const metas = state[key] || [];
    const meta = metas[metas.length - 1];
    if (!meta) continue;
    peers.push({
      user_id: meta.user_id || key,
      name: meta.name || "Usuario",
      avatar_url: meta.avatar_url || null,
      section: meta.section || "detail",
      state: meta.state === "editing" ? "editing" : "viewing",
      online_at: meta.online_at || null,
      focused_field: meta.focused_field || null,
      focused_at: meta.focused_at || null,
    });
  }
  return peers;
}

function emitPeers() {
  try {
    onPeersCb?.(presenceListToPeers(presenceChannel));
  } catch {
    /* ignore */
  }
}

function shouldEmitDataChange(payload) {
  const now = Date.now();
  // Colapsar cualquier ráfaga del mismo tool en 2s (INSERT+UPDATE, ecos, etc.)
  const key = payload?.table === "tool_calculations" && payload?.tool
    ? `tool:${payload.tool}`
    : payload?.table === "prospects"
      ? `prospects`
      : `other:${payload?.table}:${payload?.commit_timestamp || now}`;
  const prev = recentEventKeys.get(key);
  if (prev && now - prev < 2000) return false;
  recentEventKeys.set(key, now);
  if (recentEventKeys.size > 50) {
    for (const [k, t] of recentEventKeys) {
      if (now - t > 8000) recentEventKeys.delete(k);
    }
  }
  return true;
}

function scheduleDataChange(payload) {
  // Un log por cada callback Realtime (antes de dedupe/debounce) para diagnosticar ecos.
  const eventId = `${payload?.table || "?"}:${payload?.tool || "-"}:${payload?.commit_timestamp || Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
  console.info("[expediente-collab] postgres raw", {
    eventId,
    at: Date.now(),
    table: payload?.table,
    tool: payload?.tool,
    eventType: payload?.eventType,
    commit_timestamp: payload?.commit_timestamp,
    channel: activeProspectId ? expedienteDataTopic(activeProspectId) : null,
  });
  if (!shouldEmitDataChange(payload)) {
    console.info("[expediente-collab] postgres deduped", { eventId, tool: payload?.tool });
    return;
  }
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const emitId = `${payload?.table}:${payload?.tool}:${payload?.commit_timestamp || "na"}`;
    console.info("[expediente-collab] postgres emit→handler", { emitId, at: Date.now(), tool: payload?.tool });
    try {
      onDataChangeCb?.({ ...payload, eventId: emitId });
    } catch {
      /* ignore */
    }
  }, DEBOUNCE_MS);
}

function onPageHide() {
  stopExpedienteCollab().catch(() => {});
}

function ensurePagehideListener() {
  if (pagehideBound || typeof window === "undefined") return;
  pagehideBound = true;
  window.addEventListener("pagehide", onPageHide);
}

function clearFocusHeartbeat() {
  if (focusHeartbeatTimer) {
    clearInterval(focusHeartbeatTimer);
    focusHeartbeatTimer = null;
  }
}

function startFocusHeartbeat() {
  clearFocusHeartbeat();
  focusHeartbeatTimer = setInterval(() => {
    if (!lastTrack?.focused_field) {
      clearFocusHeartbeat();
      return;
    }
    updateExpedienteCollabTrack({
      focused_field: lastTrack.focused_field,
      focused_at: new Date().toISOString(),
    }).catch(() => {});
  }, 20_000);
}

async function subscribeChannel(ch) {
  return new Promise((resolve) => {
    ch.subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        resolve({ ok: true, status });
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("[expediente-collab]", status, err?.message || err || "");
        resolve({ ok: false, status });
      }
    });
  });
}

async function tearDownChannels() {
  clearTimeout(debounceTimer);
  debounceTimer = null;
  clearFocusHeartbeat();
  const sb = createClient();
  const pCh = presenceChannel;
  const dCh = dataChannel;
  presenceChannel = null;
  dataChannel = null;
  activeProspectId = null;
  presenceJoined = false;
  dataJoined = false;
  lastTrack = null;
  if (pCh) {
    try {
      await pCh.untrack();
    } catch {
      /* ignore */
    }
    await removeChannelSafe(sb, pCh);
  }
  if (dCh) await removeChannelSafe(sb, dCh);
}

export async function stopExpedienteCollab() {
  opGeneration += 1;
  onPeersCb = null;
  onDataChangeCb = null;
  opChain = opChain.then(() => tearDownChannels()).catch(() => {});
  await opChain;
}

export async function updateExpedienteCollabTrack(patch = {}) {
  if (!presenceChannel || !presenceJoined || !lastTrack) return;
  const next = {
    ...lastTrack,
    section: patch.section ?? lastTrack.section ?? "detail",
    state: patch.state ?? lastTrack.state ?? "viewing",
    online_at: new Date().toISOString(),
  };
  if (Object.prototype.hasOwnProperty.call(patch, "focused_field")) {
    next.focused_field = patch.focused_field || null;
    next.focused_at = patch.focused_field
      ? (patch.focused_at || new Date().toISOString())
      : null;
  }
  lastTrack = next;
  try {
    await presenceChannel.track(next);
    emitPeers();
  } catch (err) {
    console.warn("[expediente-collab] track:", err?.message || err);
  }
}

/** Bloqueo de campo vía Presence (mismo canal). */
export async function setFocusedField(fieldId) {
  if (fieldId) {
    await updateExpedienteCollabTrack({
      focused_field: fieldId,
      focused_at: new Date().toISOString(),
    });
    startFocusHeartbeat();
  } else {
    clearFocusHeartbeat();
    await updateExpedienteCollabTrack({ focused_field: null, focused_at: null });
  }
}

export function findFieldLocker(peers, myId, fieldId) {
  if (!fieldId) return null;
  const now = Date.now();
  const candidates = (peers || []).filter((p) => {
    if (p.user_id === myId) return false;
    if (p.focused_field !== fieldId) return false;
    if (!p.focused_at) return true;
    const age = now - new Date(p.focused_at).getTime();
    return Number.isFinite(age) && age < FIELD_LOCK_TTL_MS;
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => String(a.focused_at || "").localeCompare(String(b.focused_at || "")));
  return candidates[0];
}

export async function startExpedienteCollab(opts) {
  const {
    prospectId,
    profile,
    section = "detail",
    state = "viewing",
    focused_field = null,
    onPeers,
    onDataChange,
  } = opts || {};

  if (!isSupabaseConfigured() || !prospectId || !profile?.id) return;
  if (!isExpedienteUuid(prospectId)) {
    console.warn("[expediente-collab] prospectId no es UUID, se omite collab:", prospectId);
    return;
  }

  onPeersCb = onPeers;
  onDataChangeCb = onDataChange;
  ensurePagehideListener();

  if (presenceJoined && dataJoined && activeProspectId === prospectId && presenceChannel && dataChannel) {
    await updateExpedienteCollabTrack({ section, state, focused_field });
    emitPeers();
    return;
  }

  const myGen = ++opGeneration;
  opChain = opChain.then(async () => {
    if (myGen !== opGeneration) return;

    await tearDownChannels();
    if (myGen !== opGeneration) return;

    onPeersCb = onPeers;
    onDataChangeCb = onDataChange;

    const supabase = createClient();
    const session = await ensureBrowserSession(supabase);
    if (!session?.access_token) {
      console.warn("[expediente-collab] sin sesión realtime");
      return;
    }
    if (myGen !== opGeneration) return;

    await ensureRealtimeReady(supabase, session.access_token, 8_000);
    if (myGen !== opGeneration) return;

    const trackPayload = {
      user_id: profile.id,
      name: profile.full_name?.trim() || profile.email?.split("@")[0] || "Usuario",
      avatar_url: profile.avatar_url || null,
      section,
      state: state === "editing" ? "editing" : "viewing",
      online_at: new Date().toISOString(),
      focused_field: focused_field || null,
      focused_at: focused_field ? new Date().toISOString() : null,
    };
    lastTrack = trackPayload;
    activeProspectId = prospectId;

    const pCh = supabase.channel(expedienteTopic(prospectId), {
      config: { private: true, presence: { key: profile.id } },
    });
    pCh.on("presence", { event: "sync" }, () => emitPeers());
    pCh.on("presence", { event: "join" }, () => emitPeers());
    pCh.on("presence", { event: "leave" }, () => emitPeers());
    presenceChannel = pCh;

    const pRes = await subscribeChannel(pCh);
    if (myGen !== opGeneration) {
      await removeChannelSafe(supabase, pCh);
      if (presenceChannel === pCh) presenceChannel = null;
      return;
    }
    presenceJoined = pRes.ok;
    if (pRes.ok) {
      try {
        await pCh.track(trackPayload);
      } catch (err) {
        console.warn("[expediente-collab] track inicial:", err?.message || err);
      }
      emitPeers();
      if (trackPayload.focused_field) startFocusHeartbeat();
    }

    // Un solo handler de postgres_changes por tabla (evitar bindings duplicados).
    const dCh = supabase.channel(expedienteDataTopic(prospectId));
    const onToolChange = (payload) => {
      const row = payload?.new || payload?.old || {};
      scheduleDataChange({
        table: "tool_calculations",
        tool: row.tool || null,
        data: row.data ?? null,
        commit_timestamp: payload?.commit_timestamp || null,
        eventType: payload?.eventType || null,
      });
    };
    const onProspectChange = (payload) => {
      scheduleDataChange({
        table: "prospects",
        tool: null,
        data: payload?.new || null,
        commit_timestamp: payload?.commit_timestamp || null,
        eventType: payload?.eventType || null,
      });
    };
    dCh.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "tool_calculations", filter: `prospect_id=eq.${prospectId}` },
      onToolChange,
    );
    dCh.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "tool_calculations", filter: `prospect_id=eq.${prospectId}` },
      onToolChange,
    );
    dCh.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "prospects", filter: `id=eq.${prospectId}` },
      onProspectChange,
    );
    dataChannel = dCh;
    const dRes = await subscribeChannel(dCh);
    if (myGen !== opGeneration) {
      await removeChannelSafe(supabase, dCh);
      if (dataChannel === dCh) dataChannel = null;
      return;
    }
    dataJoined = dRes.ok;
  }).catch((err) => {
    console.warn("[expediente-collab] start:", err?.message || err);
  });

  await opChain;
}

export function getExpedienteCollabPeers() {
  return presenceListToPeers(presenceChannel);
}

export function findSectionLocker(peers, myId, section) {
  if (!section || section === "detail") return null;
  const others = (peers || []).filter(
    (p) => p.user_id !== myId && p.section === section && p.state === "editing",
  );
  if (!others.length) return null;
  others.sort((a, b) => String(a.online_at || "").localeCompare(String(b.online_at || "")));
  return others[0];
}
