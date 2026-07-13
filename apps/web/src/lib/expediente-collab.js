/**
 * Colaboración por expediente: Presence + Postgres Changes en un solo canal.
 * Topic: expediente:{prospectId}
 */
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, primeRealtimeAuth } from "@/lib/supabase/client";
import { fetchRealtimeSession } from "@/lib/presence-api.js";
import { ensureRealtimeReady, removeChannelSafe } from "@/lib/presence/realtime.js";

const DEBOUNCE_MS = 300;

let channel = null;
let activeProspectId = null;
let channelJoined = false;
let debounceTimer = null;
let onPeersCb = null;
let onDataChangeCb = null;
let myUserId = null;
let lastTrack = null;
let pagehideBound = false;

export function expedienteTopic(prospectId) {
  return `expediente:${prospectId}`;
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
    onPeersCb?.(presenceListToPeers(channel));
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

export async function stopExpedienteCollab() {
  clearTimeout(debounceTimer);
  debounceTimer = null;
  onPeersCb = null;
  onDataChangeCb = null;
  lastTrack = null;
  myUserId = null;
  const sb = createClient();
  const ch = channel;
  channel = null;
  activeProspectId = null;
  channelJoined = false;
  if (ch) {
    try {
      await ch.untrack();
    } catch {
      /* ignore */
    }
    await removeChannelSafe(sb, ch);
  }
}

export async function updateExpedienteCollabTrack({ section, state } = {}) {
  if (!channel || !channelJoined || !lastTrack) return;
  const next = {
    ...lastTrack,
    section: section || lastTrack.section || "detail",
    state: state === "editing" ? "editing" : "viewing",
    online_at: new Date().toISOString(),
  };
  lastTrack = next;
  try {
    await channel.track(next);
  } catch {
    /* ignore */
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

  onPeersCb = onPeers;
  onDataChangeCb = onDataChange;
  ensurePagehideListener();

  if (channelJoined && activeProspectId === prospectId && channel) {
    await updateExpedienteCollabTrack({ section, state });
    emitPeers();
    return;
  }

  await stopExpedienteCollab();
  onPeersCb = onPeers;
  onDataChangeCb = onDataChange;

  const supabase = createClient();
  const session = await ensureBrowserSession(supabase);
  if (!session?.access_token) return;

  await ensureRealtimeReady(supabase, session.access_token, 8_000);

  myUserId = profile.id;
  const topic = expedienteTopic(prospectId);
  const ch = supabase.channel(topic, {
    config: { private: true, presence: { key: profile.id } },
  });

  ch.on("presence", { event: "sync" }, () => emitPeers());
  ch.on("presence", { event: "join" }, () => emitPeers());
  ch.on("presence", { event: "leave" }, () => emitPeers());

  ch.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "prospects", filter: `id=eq.${prospectId}` },
    () => scheduleDataChange({ table: "prospects", tool: null }),
  );
  ch.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "tool_calculations", filter: `prospect_id=eq.${prospectId}` },
    (payload) => {
      const tool = payload?.new?.tool || payload?.old?.tool || null;
      scheduleDataChange({ table: "tool_calculations", tool });
    },
  );

  const trackPayload = {
    user_id: profile.id,
    name: profile.full_name?.trim() || profile.email?.split("@")[0] || "Usuario",
    avatar_url: profile.avatar_url || null,
    section,
    state: state === "editing" ? "editing" : "viewing",
    online_at: new Date().toISOString(),
  };
  lastTrack = trackPayload;

  channel = ch;
  activeProspectId = prospectId;

  await new Promise((resolve) => {
    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        channelJoined = true;
        try {
          await ch.track(trackPayload);
        } catch {
          /* ignore */
        }
        emitPeers();
        resolve();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        channelJoined = false;
        resolve();
      }
    });
  });
}

export function getExpedienteCollabPeers() {
  return presenceListToPeers(channel);
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
