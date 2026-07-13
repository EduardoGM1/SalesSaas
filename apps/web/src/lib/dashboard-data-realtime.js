/**
 * Realtime → invalidación del store local → Dashboard recalcula con
 * productionTourSaleCounts / getDashboardWeeks (misma fuente, sin +1 ciego).
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
    // Refetch atómico vía sync (evita carreras de +1/+1 concurrentes).
    requestSyncRefresh({ force: true, reason: `realtime:${table}:${eventType}` }).catch((err) => {
      console.warn("[dashboard-realtime] refresh:", err?.message || err);
    });
  }, DEBOUNCE_MS);
}

export async function stopDashboardDataRealtime() {
  clearTimeout(debounceTimer);
  debounceTimer = null;
  const sb = createClient();
  const ch = channel;
  channel = null;
  activeUserId = null;
  if (ch) await removeChannelSafe(sb, ch);
}

/**
 * Un solo canal, varias suscripciones postgres_changes (prospects/sales/goals/cal).
 * Filtra por user_id; RLS de tabla también aplica en Realtime.
 */
export async function startDashboardDataRealtime(userId) {
  if (!isSupabaseConfigured() || !userId || starting) return;
  if (activeUserId === userId && channel) return;

  starting = true;
  try {
    await stopDashboardDataRealtime();
    const supabase = createClient();
    const session = await ensureBrowserSession(supabase);
    if (!session?.access_token) return;

    await ensureRealtimeReady(supabase, session.access_token, 5_000);

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
          finish();
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          finish();
        }
      });
      setTimeout(finish, 8000);
    });
  } catch (err) {
    console.warn("[dashboard-realtime] start:", err?.message || err);
  } finally {
    starting = false;
  }
}
