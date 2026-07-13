/**
 * Realtime a nivel de un expediente compartido/pinneado.
 */
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, primeRealtimeAuth } from "@/lib/supabase/client";
import { fetchRealtimeSession } from "@/lib/presence-api.js";
import { ensureRealtimeReady, removeChannelSafe } from "@/lib/presence/realtime.js";

const DEBOUNCE_MS = 350;
const CHILD_TABLES = ["tool_calculations", "activities", "sales", "calendar_entries"];

let channel = null;
let activeProspectId = null;
let channelJoined = false;
let debounceTimer = null;
let onChangeCb = null;

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

function scheduleNotify() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    try { onChangeCb?.(); } catch { /* ignore */ }
  }, DEBOUNCE_MS);
}

export async function stopProspectRealtime() {
  clearTimeout(debounceTimer);
  debounceTimer = null;
  onChangeCb = null;
  const sb = createClient();
  const ch = channel;
  channel = null;
  activeProspectId = null;
  channelJoined = false;
  if (ch) await removeChannelSafe(sb, ch);
}

export async function startProspectRealtime(prospectId, onChange) {
  if (!isSupabaseConfigured() || !prospectId) return;
  onChangeCb = onChange;
  if (channelJoined && activeProspectId === prospectId) return;

  await stopProspectRealtime();
  onChangeCb = onChange;

  const supabase = createClient();
  const session = await ensureBrowserSession(supabase);
  if (!session?.access_token) return;

  await ensureRealtimeReady(supabase, session.access_token, 8_000);

  const ch = supabase.channel(`prospect-detail:${prospectId}`);
  ch.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "prospects", filter: `id=eq.${prospectId}` },
    () => scheduleNotify(),
  );
  for (const table of CHILD_TABLES) {
    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table, filter: `prospect_id=eq.${prospectId}` },
      () => scheduleNotify(),
    );
  }

  channel = ch;
  activeProspectId = prospectId;
  await new Promise((resolve) => {
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channelJoined = true;
        resolve();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        channelJoined = false;
        resolve();
      }
    });
  });
}
