import webpush from "web-push";
import { createServiceSupabaseClient } from "../lib/supabase-server.js";
import { primaryWebOrigin } from "../lib/origins.js";
import { ServiceError } from "../lib/service-error.js";

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:support@salesapp.local";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || null;
}

export function isPushConfigured() {
  return Boolean(getVapidPublicKey() && process.env.VAPID_PRIVATE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function displayName(profile) {
  return profile?.full_name?.trim() || profile?.email?.split("@")[0] || "Usuario";
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

async function sendToUser(userId, payload) {
  if (!ensureVapid()) return;
  const serviceSb = createServiceSupabaseClient();
  if (!serviceSb) return;

  const { data: subs, error } = await serviceSb
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (error || !subs?.length) return;

  const body = JSON.stringify(payload);

  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }, body);
    } catch (err) {
      const code = err?.statusCode;
      if (code === 404 || code === 410) {
        await serviceSb.from("push_subscriptions").delete().eq("id", sub.id);
      } else if (process.env.NODE_ENV !== "production") {
        console.warn("[push] Error enviando notificación:", code, err?.message);
      }
    }
  }));
}

export async function savePushSubscription(supabase, userId, subscription, userAgent) {
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    throw new ServiceError("Suscripción push inválida.", 400);
  }

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({
      user_id: userId,
      endpoint,
      p256dh,
      auth,
      user_agent: userAgent ? String(userAgent).slice(0, 500) : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,endpoint" });

  if (error) throw new ServiceError(error.message, 400);
  return { ok: true };
}

export async function removePushSubscription(supabase, userId, endpoint) {
  if (!endpoint) throw new ServiceError("Endpoint requerido.", 400);
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", endpoint);
  if (error) throw new ServiceError(error.message, 400);
  return { ok: true };
}

export async function getPushStatus(supabase, userId) {
  const { count, error } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new ServiceError(error.message, 500);
  return {
    subscribed: (count ?? 0) > 0,
    push_configured: isPushConfigured(),
    permission_required: true,
  };
}

export async function notifyNewMessage(recipientId, { senderId, senderName, body }) {
  const serviceSb = createServiceSupabaseClient();
  if (!serviceSb || !ensureVapid()) return;

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
  if (!serviceSb || !ensureVapid()) return;

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
  if (!serviceSb || !ensureVapid()) return;

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
