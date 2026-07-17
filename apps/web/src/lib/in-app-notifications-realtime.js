/**
 * Canal dual desktop: toasts in-app vía Supabase Realtime (sin Web Push).
 * No se usa en móvil/PWA para no alterar el comportamiento nativo existente.
 */
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, primeRealtimeAuth } from "@/lib/supabase/client";
import { fetchRealtimeSession } from "@/lib/presence-api.js";
import { ensureRealtimeReady, removeChannelSafe } from "@/lib/presence/realtime.js";
import { getInstallPlatform } from "@/lib/pwa-install.js";
import {
  PushType,
  presentInAppNotification,
  messagePath,
  networkPath,
  contactPath,
  sharedProspectPath,
} from "@/lib/in-app-notifications.js";
import { notifyUnreadMessagesChanged } from "@/lib/messages-unread.js";

let channel = null;
let activeUserId = null;
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

export async function stopInAppNotificationsRealtime() {
  const sb = createClient();
  const ch = channel;
  channel = null;
  activeUserId = null;
  if (ch) await removeChannelSafe(sb, ch);
}

export async function startInAppNotificationsRealtime(userId) {
  if (getInstallPlatform() !== "desktop") return;
  if (!isSupabaseConfigured() || !userId || starting) return;
  if (channel && activeUserId === userId) return;

  starting = true;
  try {
    await stopInAppNotificationsRealtime();
    const supabase = createClient();
    const session = await ensureBrowserSession(supabase);
    if (!session?.access_token) return;

    await ensureRealtimeReady(supabase, session.access_token, 8_000);

    const ch = supabase
      .channel(`in-app-notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new || {};
          const senderId = row.sender_id;
          const body = String(row.body || "").trim();
          const short = body.length > 120 ? `${body.slice(0, 120)}…` : body;
          presentInAppNotification({
            type: PushType.MESSAGE,
            title: "Nuevo mensaje",
            body: short || "Tienes un mensaje nuevo",
            path: senderId ? messagePath(senderId) : "/messages",
            dedupeKey: `rt-msg:${row.id || `${senderId}:${row.created_at}`}`,
          });
          notifyUnreadMessagesChanged();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_connections",
          filter: `addressee_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new || {};
          if (row.status && row.status !== "pending") return;
          presentInAppNotification({
            type: PushType.CONNECTION_REQUEST,
            title: "Solicitud de contacto",
            body: "Alguien quiere agregarte a su red",
            path: networkPath(),
            dedupeKey: `rt-conn-req:${row.id}`,
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "user_connections",
          filter: `requester_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new || {};
          const prev = payload.old || {};
          if (row.status !== "accepted" || prev.status === "accepted") return;
          const peerId = row.addressee_id;
          presentInAppNotification({
            type: PushType.CONNECTION_ACCEPTED,
            title: "Solicitud aceptada",
            body: "Tu contacto aceptó la solicitud",
            path: peerId ? contactPath(peerId) : networkPath(),
            dedupeKey: `rt-conn-ok:${row.id}`,
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "prospect_shares",
          filter: `shared_with_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new || {};
          const ownerId = row.owner_id;
          const prospectId = row.prospect_id;
          presentInAppNotification({
            type: PushType.SHARED_PROSPECT,
            title: "Expediente compartido",
            body: "Un contacto compartió un expediente contigo",
            path: ownerId && prospectId
              ? sharedProspectPath(ownerId, prospectId)
              : networkPath(),
            dedupeKey: `rt-share:${row.id}`,
          });
        },
      );

    await new Promise((resolve) => {
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          resolve(status);
        }
      });
    });

    channel = ch;
    activeUserId = userId;
  } catch (err) {
    console.warn("[in-app-notifications] start failed:", err?.message || err);
  } finally {
    starting = false;
  }
}
