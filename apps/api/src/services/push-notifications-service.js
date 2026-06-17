import { createServiceSupabaseClient } from "../lib/supabase-server.js";
import { primaryWebOrigin } from "../lib/origins.js";

const ONESIGNAL_API = "https://api.onesignal.com/notifications";

export function getOneSignalAppId() {
  return process.env.ONESIGNAL_APP_ID || process.env.VITE_ONESIGNAL_APP_ID || null;
}

export function isPushConfigured() {
  return Boolean(getOneSignalAppId() && process.env.ONESIGNAL_REST_API_KEY);
}

async function loadNotificationPrefs(serviceSb, userId) {
  const { data } = await serviceSb
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .maybeSingle();
  const notifications = data?.settings?.notifications ?? {};
  return {
    messages: notifications.messages !== false,
    connection_requests: notifications.connection_requests !== false,
    connection_accepted: notifications.connection_accepted !== false,
  };
}

async function sendToUser(userId, { title, body, url, tag }) {
  const appId = getOneSignalAppId();
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!appId || !apiKey) return;

  const payload = {
    app_id: appId,
    target_channel: "push",
    include_aliases: { external_id: [String(userId)] },
    headings: { en: title, es: title },
    contents: { en: body, es: body },
    url,
    web_push_topic: tag,
    collapse_id: tag,
    data: { url },
  };

  const res = await fetch(ONESIGNAL_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    if (process.env.NODE_ENV !== "production") {
      console.warn("[onesignal] Error enviando notificación:", res.status, errBody);
    }
  }
}

export async function getPushStatus() {
  return {
    subscribed: null,
    push_configured: isPushConfigured(),
    provider: "onesignal",
    permission_required: true,
  };
}

export async function notifyNewMessage(recipientId, { senderId, senderName, body }) {
  const serviceSb = createServiceSupabaseClient();
  if (!serviceSb || !isPushConfigured()) return;

  const prefs = await loadNotificationPrefs(serviceSb, recipientId);
  if (!prefs.messages) return;

  const preview = String(body ?? "").trim();
  const short = preview.length > 120 ? `${preview.slice(0, 120)}…` : preview;
  const origin = primaryWebOrigin();

  await sendToUser(recipientId, {
    title: senderName || "Nuevo mensaje",
    body: short || "Tienes un mensaje nuevo",
    url: `${origin}/messages?with=${senderId}`,
    tag: `message-${senderId}`,
  });
}

export async function notifyConnectionRequest(addresseeId, { requesterId, requesterName }) {
  const serviceSb = createServiceSupabaseClient();
  if (!serviceSb || !isPushConfigured()) return;

  const prefs = await loadNotificationPrefs(serviceSb, addresseeId);
  if (!prefs.connection_requests) return;

  const origin = primaryWebOrigin();
  await sendToUser(addresseeId, {
    title: "Solicitud de contacto",
    body: `${requesterName || "Alguien"} quiere agregarte a su red`,
    url: `${origin}/red`,
    tag: `connection-request-${requesterId}`,
  });
}

export async function notifyConnectionAccepted(requesterId, { peerId, peerName }) {
  const serviceSb = createServiceSupabaseClient();
  if (!serviceSb || !isPushConfigured()) return;

  const prefs = await loadNotificationPrefs(serviceSb, requesterId);
  if (!prefs.connection_accepted) return;

  const origin = primaryWebOrigin();
  await sendToUser(requesterId, {
    title: "Solicitud aceptada",
    body: `${peerName || "Tu contacto"} aceptó tu solicitud`,
    url: `${origin}/red/contacto/${peerId}`,
    tag: `connection-accepted-${peerId}`,
  });
}

// Compatibilidad con rutas antiguas (VAPID / web-push).
export async function savePushSubscription() {
  return { ok: true };
}

export async function removePushSubscription() {
  return { ok: true };
}
