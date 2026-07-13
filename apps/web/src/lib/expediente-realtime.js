/**
 * Realtime unificado por expediente (Sheets/Figma):
 * - Presence  (privado expediente:{id})     → quién está (ojo + avatares)
 * - Broadcast (mismo canal privado)         → field_lock / field_unlock
 * - Postgres Changes (expediente-data:{id}) → dato persistido + toast
 *
 * Un solo API lógico; dos topics físicos (Presence privado no mezcla bien con Changes).
 */
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, primeRealtimeAuth } from "@/lib/supabase/client";
import { fetchRealtimeSession } from "@/lib/presence-api.js";
import { ensureRealtimeReady, removeChannelSafe } from "@/lib/presence/realtime.js";

const DEBOUNCE_MS = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const FIELD_LOCK_TTL_MS = 60_000;
const LOCK_HEARTBEAT_MS = 20_000;
const LOCK_EVENT = "field_lock";
const UNLOCK_EVENT = "field_unlock";

let presenceChannel = null;
let dataChannel = null;
let activeProspectId = null;
let presenceJoined = false;
let dataJoined = false;
let debounceTimer = null;
let pendingDataChange = null;
let lastTrack = null;
let pagehideBound = false;
let opGeneration = 0;
let opChain = Promise.resolve();
let lockHeartbeatTimer = null;
let myFocusedField = null;
let myProfile = null;

/** @type {Map<string, { user_id: string, name: string, avatar_url: string|null, field_id: string, ts: number }>} */
let fieldLocks = new Map();

const recentEventKeys = new Map();
const consumers = new Set(); // ref-count via consumer ids

let onPeersCb = null;
let onLocksCb = null;
let onDataChangeCb = null;

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
  const peers = presenceListToPeers(presenceChannel);
  // Locks huérfanos: si el user ya no está en Presence, liberar sus campos.
  const live = new Set(peers.map((p) => p.user_id));
  if (myProfile?.id) live.add(myProfile.id);
  let locksChanged = false;
  for (const [fieldId, lock] of fieldLocks) {
    if (!live.has(lock.user_id)) {
      fieldLocks.delete(fieldId);
      locksChanged = true;
    }
  }
  if (locksChanged) emitLocks();
  try {
    onPeersCb?.(peers);
  } catch {
    /* ignore */
  }
}

function locksSnapshot() {
  const now = Date.now();
  const out = [];
  for (const [fieldId, lock] of fieldLocks) {
    if (now - lock.ts > FIELD_LOCK_TTL_MS) {
      fieldLocks.delete(fieldId);
      continue;
    }
    out.push({ ...lock, field_id: fieldId });
  }
  return out;
}

function emitLocks() {
  try {
    onLocksCb?.(locksSnapshot());
  } catch {
    /* ignore */
  }
}

function applyRemoteLock(payload) {
  const fieldId = payload?.field_id;
  const userId = payload?.user_id;
  if (!fieldId || !userId) return;
  if (myProfile?.id && userId === myProfile.id) return; // propio lock ya está en myFocusedField
  fieldLocks.set(fieldId, {
    user_id: userId,
    name: payload.name || "Usuario",
    avatar_url: payload.avatar_url || null,
    field_id: fieldId,
    ts: typeof payload.ts === "number" ? payload.ts : Date.now(),
  });
  emitLocks();
}

function applyRemoteUnlock(payload) {
  const fieldId = payload?.field_id;
  const userId = payload?.user_id;
  if (!fieldId) return;
  const cur = fieldLocks.get(fieldId);
  if (!cur) return;
  if (userId && cur.user_id !== userId) return;
  fieldLocks.delete(fieldId);
  emitLocks();
}

function clearLocksForUser(userId) {
  if (!userId) return;
  let changed = false;
  for (const [fieldId, lock] of fieldLocks) {
    if (lock.user_id === userId) {
      fieldLocks.delete(fieldId);
      changed = true;
    }
  }
  if (changed) emitLocks();
}

function shouldEmitDataChange(payload) {
  const now = Date.now();
  const key = payload?.table === "tool_calculations" && payload?.tool
    ? `tool:${payload.tool}`
    : payload?.table === "prospects"
      ? `prospects`
      : `other:${payload?.table}:${payload?.commit_timestamp || now}`;
  const prev = recentEventKeys.get(key);
  if (prev && now - prev < 900) return false;
  recentEventKeys.set(key, now);
  if (recentEventKeys.size > 50) {
    for (const [k, t] of recentEventKeys) {
      if (now - t > 8000) recentEventKeys.delete(k);
    }
  }
  return true;
}

function preferDataPayload(prev, next) {
  if (!prev) return next;
  if (!next) return prev;
  const prevHas = prev.data != null && typeof prev.data === "object";
  const nextHas = next.data != null && typeof next.data === "object";
  if (nextHas && !prevHas) return next;
  return next;
}

function emitPendingDataChange(payload) {
  if (!payload) return;
  if (!shouldEmitDataChange(payload)) return;
  const emitId = `${payload?.table}:${payload?.tool}:${payload?.commit_timestamp || "na"}`;
  try {
    onDataChangeCb?.({ ...payload, eventId: emitId });
  } catch {
    /* ignore */
  }
}

function scheduleDataChange(payload) {
  if (
    pendingDataChange
    && payload?.table === pendingDataChange.table
    && (payload?.tool || null) === (pendingDataChange.tool || null)
  ) {
    pendingDataChange = preferDataPayload(pendingDataChange, payload);
  } else if (pendingDataChange) {
    const flush = pendingDataChange;
    pendingDataChange = payload;
    clearTimeout(debounceTimer);
    debounceTimer = null;
    emitPendingDataChange(flush);
  } else {
    pendingDataChange = payload;
  }

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const pending = pendingDataChange;
    pendingDataChange = null;
    emitPendingDataChange(pending);
  }, DEBOUNCE_MS);
}

async function subscribeChannel(ch) {
  return new Promise((resolve) => {
    ch.subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        resolve({ ok: true, status });
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("[expediente-realtime]", status, err?.message || err || "");
        resolve({ ok: false, status });
      }
    });
  });
}

function clearLockHeartbeat() {
  if (lockHeartbeatTimer) {
    clearInterval(lockHeartbeatTimer);
    lockHeartbeatTimer = null;
  }
}

function startLockHeartbeat() {
  clearLockHeartbeat();
  lockHeartbeatTimer = setInterval(() => {
    if (!myFocusedField || !myProfile?.id) {
      clearLockHeartbeat();
      return;
    }
    broadcastLock(myFocusedField).catch(() => {});
  }, LOCK_HEARTBEAT_MS);
}

async function broadcastLock(fieldId) {
  if (!presenceChannel || !presenceJoined || !myProfile?.id || !fieldId) return;
  const payload = {
    field_id: fieldId,
    user_id: myProfile.id,
    name: myProfile.full_name?.trim() || myProfile.email?.split("@")[0] || "Usuario",
    avatar_url: myProfile.avatar_url || null,
    ts: Date.now(),
  };
  try {
    await presenceChannel.send({
      type: "broadcast",
      event: LOCK_EVENT,
      payload,
    });
  } catch (err) {
    console.warn("[expediente-realtime] lock broadcast:", err?.message || err);
  }
}

async function broadcastUnlock(fieldId) {
  if (!presenceChannel || !presenceJoined || !myProfile?.id) return;
  const payload = {
    field_id: fieldId || myFocusedField,
    user_id: myProfile.id,
    ts: Date.now(),
  };
  if (!payload.field_id) return;
  try {
    await presenceChannel.send({
      type: "broadcast",
      event: UNLOCK_EVENT,
      payload,
    });
  } catch (err) {
    console.warn("[expediente-realtime] unlock broadcast:", err?.message || err);
  }
}

async function tearDownChannels() {
  clearTimeout(debounceTimer);
  debounceTimer = null;
  pendingDataChange = null;
  clearLockHeartbeat();
  myFocusedField = null;
  fieldLocks.clear();
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
  emitPeers();
  emitLocks();
}

function onPageHide() {
  stopExpedienteRealtime().catch(() => {});
}

function ensurePagehideListener() {
  if (pagehideBound || typeof window === "undefined") return;
  pagehideBound = true;
  window.addEventListener("pagehide", onPageHide);
}

/**
 * Registra un consumidor. Ref-count: teardown solo cuando no queda ninguno.
 * @returns {() => void} unsubscribe
 */
export function subscribeExpedienteRealtime(opts) {
  const {
    prospectId,
    profile,
    section = "detail",
    state = "viewing",
    onPeers,
    onLocks,
    onDataChange,
  } = opts || {};

  const consumerId = Symbol("expediente-rt");
  const entry = {
    id: consumerId,
    prospectId,
    profile,
    section,
    state,
    onPeers,
    onLocks,
    onDataChange,
  };
  consumers.add(entry);

  const wireCallbacks = () => {
    // Último consumidor gana los callbacks (todos los hooks actualizan vía su propio entry en el hook React).
    // Re-emitimos a TODOS los consumidores activos del mismo prospectId.
    onPeersCb = (peers) => {
      for (const c of consumers) {
        if (c.prospectId === activeProspectId) {
          try { c.onPeers?.(peers); } catch { /* ignore */ }
        }
      }
    };
    onLocksCb = (locks) => {
      for (const c of consumers) {
        if (c.prospectId === activeProspectId) {
          try { c.onLocks?.(locks); } catch { /* ignore */ }
        }
      }
    };
    onDataChangeCb = (payload) => {
      for (const c of consumers) {
        if (c.prospectId === activeProspectId) {
          try { c.onDataChange?.(payload); } catch { /* ignore */ }
        }
      }
    };
  };

  wireCallbacks();
  startExpedienteRealtime({
    prospectId,
    profile,
    section,
    state,
  }).catch(() => {});

  return () => {
    consumers.delete(entry);
    wireCallbacks();
    if (consumers.size === 0) {
      stopExpedienteRealtime().catch(() => {});
    } else {
      // Si queda otro consumidor del mismo expediente, actualizar track con su section
      const still = [...consumers].find((c) => c.prospectId === prospectId);
      if (still) {
        updateExpedienteTrack({ section: still.section, state: still.state }).catch(() => {});
      }
    }
  };
}

export async function stopExpedienteRealtime() {
  opGeneration += 1;
  onPeersCb = null;
  onLocksCb = null;
  onDataChangeCb = null;
  consumers.clear();
  opChain = opChain.then(() => tearDownChannels()).catch(() => {});
  await opChain;
}

export async function updateExpedienteTrack(patch = {}) {
  if (!presenceChannel || !presenceJoined || !lastTrack) return;
  const next = {
    ...lastTrack,
    section: patch.section ?? lastTrack.section ?? "detail",
    state: patch.state ?? lastTrack.state ?? "viewing",
    online_at: new Date().toISOString(),
  };
  lastTrack = next;
  try {
    await presenceChannel.track(next);
    emitPeers();
  } catch (err) {
    console.warn("[expediente-realtime] track:", err?.message || err);
  }
}

/** Bloqueo de campo vía Broadcast (no Presence). */
export async function setFocusedField(fieldId) {
  if (fieldId) {
    const prev = myFocusedField;
    myFocusedField = fieldId;
    if (prev && prev !== fieldId) {
      await broadcastUnlock(prev);
    }
    await broadcastLock(fieldId);
    startLockHeartbeat();
  } else {
    const prev = myFocusedField;
    myFocusedField = null;
    clearLockHeartbeat();
    if (prev) await broadcastUnlock(prev);
  }
}

export function getMyFocusedField() {
  return myFocusedField;
}

export function findFieldLocker(locksOrPeers, myId, fieldId) {
  if (!fieldId) return null;
  const now = Date.now();
  // Nuevo: array de locks desde Broadcast
  if (Array.isArray(locksOrPeers) && locksOrPeers[0]?.field_id !== undefined) {
    const hit = locksOrPeers.find((l) => {
      if (l.field_id !== fieldId) return false;
      if (l.user_id === myId) return false;
      return now - (l.ts || 0) < FIELD_LOCK_TTL_MS;
    });
    return hit || null;
  }
  // Compat: Map snapshot
  if (locksOrPeers instanceof Map) {
    const lock = locksOrPeers.get(fieldId);
    if (!lock || lock.user_id === myId) return null;
    if (now - lock.ts > FIELD_LOCK_TTL_MS) return null;
    return lock;
  }
  return null;
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

export async function startExpedienteRealtime(opts) {
  const {
    prospectId,
    profile,
    section = "detail",
    state = "viewing",
  } = opts || {};

  if (!isSupabaseConfigured() || !prospectId || !profile?.id) return;
  if (!isExpedienteUuid(prospectId)) {
    console.warn("[expediente-realtime] prospectId no es UUID:", prospectId);
    return;
  }

  myProfile = profile;
  ensurePagehideListener();

  if (presenceJoined && dataJoined && activeProspectId === prospectId && presenceChannel && dataChannel) {
    await updateExpedienteTrack({ section, state });
    emitPeers();
    emitLocks();
    return;
  }

  const myGen = ++opGeneration;
  opChain = opChain.then(async () => {
    if (myGen !== opGeneration) return;

    await tearDownChannels();
    if (myGen !== opGeneration) return;

    const supabase = createClient();
    const session = await ensureBrowserSession(supabase);
    if (!session?.access_token) {
      console.warn("[expediente-realtime] sin sesión realtime");
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
    };
    lastTrack = trackPayload;
    activeProspectId = prospectId;
    fieldLocks = new Map();

    const pCh = supabase.channel(expedienteTopic(prospectId), {
      config: {
        private: true,
        presence: { key: profile.id },
        broadcast: { self: false },
      },
    });

    pCh.on("presence", { event: "sync" }, () => emitPeers());
    pCh.on("presence", { event: "join" }, () => emitPeers());
    pCh.on("presence", { event: "leave" }, ({ leftPresences }) => {
      emitPeers();
      const left = leftPresences || [];
      for (const meta of left) {
        const uid = meta?.user_id || meta?.key;
        if (uid) clearLocksForUser(uid);
      }
    });
    pCh.on("broadcast", { event: LOCK_EVENT }, ({ payload }) => applyRemoteLock(payload));
    pCh.on("broadcast", { event: UNLOCK_EVENT }, ({ payload }) => applyRemoteUnlock(payload));

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
        console.warn("[expediente-realtime] track inicial:", err?.message || err);
      }
      emitPeers();
    }

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
    console.warn("[expediente-realtime] start:", err?.message || err);
  });

  await opChain;
}

export function getExpedientePeers() {
  return presenceListToPeers(presenceChannel);
}

export function getFieldLocks() {
  return locksSnapshot();
}

// --- Compat aliases (migración desde expediente-collab) ---
export async function startExpedienteCollab(opts) {
  return startExpedienteRealtime(opts);
}
export const stopExpedienteCollab = stopExpedienteRealtime;
export const updateExpedienteCollabTrack = updateExpedienteTrack;
