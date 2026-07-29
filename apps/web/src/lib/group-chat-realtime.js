/**
 * Realtime del hilo de chat grupal de un expediente (MessagesPage).
 */
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, primeRealtimeAuth } from "@/lib/supabase/client";
import { fetchRealtimeSession } from "@/lib/presence-api.js";
import { ensureRealtimeReady, removeChannelSafe } from "@/lib/presence/realtime.js";

const DEBOUNCE_MS = 250;

let channel = null;
let activeConversationId = null;
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

export async function stopGroupChatRealtime() {
  clearTimeout(debounceTimer);
  debounceTimer = null;
  onChangeCb = null;
  const sb = createClient();
  const ch = channel;
  channel = null;
  activeConversationId = null;
  channelJoined = false;
  if (ch) await removeChannelSafe(sb, ch);
}

export async function startGroupChatRealtime(conversationId, onChange) {
  if (!isSupabaseConfigured() || !conversationId) return;
  onChangeCb = onChange;
  if (channelJoined && activeConversationId === conversationId) return;

  await stopGroupChatRealtime();
  onChangeCb = onChange;

  const supabase = createClient();
  const session = await ensureBrowserSession(supabase);
  if (!session?.access_token) return;

  await ensureRealtimeReady(supabase, session.access_token, 8_000);

  const ch = supabase.channel(`group-chat:${conversationId}`);
  ch.on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "chat_messages",
      filter: `conversation_id=eq.${conversationId}`,
    },
    () => scheduleNotify(),
  );

  channel = ch;
  activeConversationId = conversationId;
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
