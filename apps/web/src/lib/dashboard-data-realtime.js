/**
 * Realtime → invalidación del store local → Dashboard recalcula con
 * productionTourSaleCounts / getDashboardWeeks (misma fuente, sin +1 ciego).
 *
 * En PWA el WebSocket suele morir en background: hay que re-suscribir al resume.
 */
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, primeRealtimeAuth } from "@/lib/supabase/client";
import { fetchRealtimeSession } from "@/lib/presence-api.js";
import { ensureRealtimeReady, removeChannelSafe } from "@/lib/presence/realtime.js";
import { requestSyncRefresh } from "@/lib/sync-refresh.js";

const DEBOUNCE_MS = 400;
const TABLES = ["prospects", "sales", "goals", "calendar_entries"];

let channel = null;
let activeUserId = null;
let channelJoined = false;
let debounceTimer = null;
let starting = false;

async function ensureBrowserSession(supabase) {
  let { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token && session?.user?.id) return session;
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

function scheduleInvalidate(table, eventType) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    requestSyncRefresh({ force: true, reason: `realtime:${table}:${eventType}` }).catch((err) => {
      console.warn("[dashboard-realtime] refresh:", err?.message || err);
    });
  }, DEBOUNCE_MS);
}

function markChannelDead(reason) {
  channelJoined = false;
  if (reason) console.warn("[dashboard-realtime] canal caído:", reason);
}

export function isDashboardRealtimeHealthy() {
  if (!channel || !activeUserId || !channelJoined) return false;
  try {
    const state = channel.state;
    // joined | subscribed según versión del SDK
    if (state && state !== "joined" && state !== "joined_presence" && state !== "subscribed") {
      return false;
    }
  } catch {
    // ignore
  }
  return true;
}

export async function stopDashboardDataRealtime() {
  clearTimeout(debounceTimer);
  debounceTimer = null;
  const sb = createClient();
  const ch = channel;
  channel = null;
  activeUserId = null;
  channelJoined = false;
  if (ch) await removeChannelSafe(sb, ch);
}

/**
 * Un solo canal, varias suscripciones postgres_changes.
 * @param {string} userId
 * @param {{ force?: boolean }} [opts] force=true recrea el canal aunque parezca vivo
 */
export async function startDashboardDataRealtime(userId, opts = {}) {
  const force = opts.force === true;
  if (!isSupabaseConfigured() || !userId || starting) return;
  if (!force && isDashboardRealtimeHealthy() && activeUserId === userId) return;

  starting = true;
  try {
    await stopDashboardDataRealtime();
    const supabase = createClient();
    const session = await ensureBrowserSession(supabase);
    if (!session?.access_token) {
      console.warn("[dashboard-realtime] sin sesión browser; no se suscribe");
      return;
    }

    const ready = await ensureRealtimeReady(supabase, session.access_token, 8_000);
    if (!ready) {
      console.warn("[dashboard-realtime] Realtime no conectó a tiempo");
    }

    let ch = supabase.channel(`dashboard-data:${userId}`);
    for (const table of TABLES) {
      ch = ch.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          scheduleInvalidate(table, payload.eventType || payload.event || "*");
        },
      );
    }

    channel = ch;
    channelJoined = false;

    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          activeUserId = userId;
          channelJoined = true;
          finish();
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          markChannelDead(status);
          finish();
        }
      });
      setTimeout(() => {
        if (!channelJoined) markChannelDead("subscribe-timeout");
        finish();
      }, 8000);
    });
  } catch (err) {
    markChannelDead("exception");
    console.warn("[dashboard-realtime] start:", err?.message || err);
  } finally {
    starting = false;
  }
}

/** Re-suscribe si el canal murió (típico al volver a la PWA). */
export async function ensureDashboardDataRealtime(userId, opts = {}) {
  if (!userId) return;
  const force = opts.force === true || !isDashboardRealtimeHealthy() || activeUserId !== userId;
  if (!force) return;
  await startDashboardDataRealtime(userId, { force: true });
}
