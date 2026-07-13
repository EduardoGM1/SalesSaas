/**
 * Colaboración por expediente:
 * - Presence (privado): expediente:{prospectId}
 * - Postgres Changes (público): expediente-data:{prospectId}
 *
 * No mezclar presence privado + postgres_changes en el mismo canal:
 * Realtime Authorization solo aplica a Presence/Broadcast y puede dejar
 * el canal en CHANNEL_ERROR sin avatares ni sync.
 */
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, primeRealtimeAuth } from "@/lib/supabase/client";
import { fetchRealtimeSession } from "@/lib/presence-api.js";
import { ensureRealtimeReady, removeChannelSafe } from "@/lib/presence/realtime.js";

const DEBOUNCE_MS = 300;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function scheduleDataChange(payload) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    try {
      onDataChangeCb?.(payload);
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

export async function stopExpedienteCollab() {
  clearTimeout(debounceTimer);
  debounceTimer = null;
  onPeersCb = null;
  onDataChangeCb = null;
  lastTrack = null;
  const sb = createClient();
  const pCh = presenceChannel;
  const dCh = dataChannel;
  presenceChannel = null;
  dataChannel = null;
  activeProspectId = null;
  presenceJoined = false;
  dataJoined = false;
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

export async function updateExpedienteCollabTrack({ section, state } = {}) {
  if (!presenceChannel || !presenceJoined || !lastTrack) return;
  const next = {
    ...lastTrack,
    section: section || lastTrack.section || "detail",
    state: state === "editing" ? "editing" : "viewing",
    online_at: new Date().toISOString(),
  };
  lastTrack = next;
  try {
    await presenceChannel.track(next);
  } catch (err) {
    console.warn("[expediente-collab] track:", err?.message || err);
  }
}

/**
 * @param {{
 *   prospectId: string,
 *   profile: { id: string, full_name?: string, email?: string, avatar_url?: string },
 *   section?: string,
 *   state?: 'viewing'|'editing',
 *   onPeers?: (peers: Array) => void,
 *   onDataChange?: (payload: { table: string, tool?: string|null }) => void,
 * }} opts
 */
export async function startExpedienteCollab(opts) {
  const {
    prospectId,
    profile,
    section = "detail",
    state = "viewing",
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

  if (presenceJoined && dataJoined && activeProspectId === prospectId && presenceChannel) {
    await updateExpedienteCollabTrack({ section, state });
    emitPeers();
    return;
  }

  await stopExpedienteCollab();
  onPeersCb = onPeers;
  onDataChangeCb = onDataChange;

  const supabase = createClient();
  const session = await ensureBrowserSession(supabase);
  if (!session?.access_token) {
    console.warn("[expediente-collab] sin sesión realtime");
    return;
  }

  await ensureRealtimeReady(supabase, session.access_token, 8_000);

  const trackPayload = {
    user_id: profile.id,
    name: profile.full_name?.trim() || profile.email?.split("@")[0] || "Usuario",
    avatar_url: profile.avatar_url || null,
    section,
    state: state === "editing" ? "editing" : "viewing",
    online_at: new Date().toISOString(),
  };
  lastTrack = trackPayload;
  activeProspectId = prospectId;

  // 1) Presence privado
  const pCh = supabase.channel(expedienteTopic(prospectId), {
    config: { private: true, presence: { key: profile.id } },
  });
  pCh.on("presence", { event: "sync" }, () => emitPeers());
  pCh.on("presence", { event: "join" }, () => emitPeers());
  pCh.on("presence", { event: "leave" }, () => emitPeers());
  presenceChannel = pCh;

  const pRes = await subscribeChannel(pCh);
  presenceJoined = pRes.ok;
  if (pRes.ok) {
    try {
      await pCh.track(trackPayload);
    } catch (err) {
      console.warn("[expediente-collab] track inicial:", err?.message || err);
    }
    emitPeers();
  }

  // 2) Postgres Changes en canal aparte (no privado)
  const dCh = supabase.channel(expedienteDataTopic(prospectId));
  dCh.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "prospects", filter: `id=eq.${prospectId}` },
    () => scheduleDataChange({ table: "prospects", tool: null }),
  );
  dCh.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "tool_calculations", filter: `prospect_id=eq.${prospectId}` },
    (payload) => {
      const tool = payload?.new?.tool || payload?.old?.tool || null;
      scheduleDataChange({ table: "tool_calculations", tool });
    },
  );
  dataChannel = dCh;
  const dRes = await subscribeChannel(dCh);
  dataJoined = dRes.ok;
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
