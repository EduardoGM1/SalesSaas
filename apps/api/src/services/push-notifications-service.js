import { createServiceSupabaseClient } from "../lib/supabase-server.js";
import { primaryWebOrigin } from "../lib/origins.js";
import { ServiceError } from "../lib/service-error.js";
import {
  PushType,
  contactPath,
  messagePath,
  networkPath,
  pushUrl,
  sharedProspectPath,
} from "@salesapp/shared/push/notification-targets.js";

const ONESIGNAL_API = "https://api.onesignal.com/notifications";
const MAX_STORED_SUBSCRIPTIONS = 5;

export function getOneSignalAppId() {
  return process.env.ONESIGNAL_APP_ID || process.env.VITE_ONESIGNAL_APP_ID || null;
}

export function getSafariWebId() {
  return process.env.ONESIGNAL_SAFARI_WEB_ID || process.env.VITE_ONESIGNAL_SAFARI_WEB_ID || null;
}

export function isPushConfigured() {
  return Boolean(getOneSignalAppId() && process.env.ONESIGNAL_REST_API_KEY);
}

async function loadProfileSettings(serviceSb, userId) {
  const { data } = await serviceSb
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .maybeSingle();
  return data?.settings ?? {};
}

async function loadNotificationPrefs(serviceSb, userId) {
  const notifications = (await loadProfileSettings(serviceSb, userId)).notifications ?? {};
  return {
    messages: notifications.messages !== false,
    connection_requests: notifications.connection_requests !== false,
    connection_accepted: notifications.connection_accepted !== false,
    shared_prospects: notifications.shared_prospects !== false,
  };
}

async function loadSubscriptionIds(serviceSb, userId) {
  const settings = await loadProfileSettings(serviceSb, userId);
  const ids = settings.onesignal_subscription_ids;
  return Array.isArray(ids) ? ids.filter(Boolean) : [];
}

function buildMessagePayload(appId, { title, body, url, path, type, tag }) {
  const appPath = path || "/";
  return {
    app_id: appId,
    headings: { en: title, es: title },
    contents: { en: body, es: body },
    url,
    web_push_topic: tag,
    collapse_id: tag,
    data: { url, path: appPath, type: type || null },
  };
}

async function postOneSignal(apiKey, payload) {
  const res = await fetch(ONESIGNAL_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));
  const ok = res.ok && Boolean(body.id) && !body.errors?.length;
  if (!ok) {
    console.warn("[onesignal] Envío fallido:", {
      status: res.status,
      errors: body.errors,
      recipients: body.recipients,
    });
  }
  return { ok, body };
}

async function sendToUser(serviceSb, userId, message) {
  const appId = getOneSignalAppId();
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!appId || !apiKey) return { ok: false, reason: "not_configured" };

  const base = buildMessagePayload(appId, message);

  const byAlias = await postOneSignal(apiKey, {
    ...base,
    target_channel: "push",
    include_aliases: { external_id: [String(userId)] },
  });
  if (byAlias.ok) return byAlias;

  const subscriptionIds = await loadSubscriptionIds(serviceSb, userId);
  if (!subscriptionIds.length) {
    console.warn("[onesignal] Sin suscripción para usuario", userId, byAlias.body?.errors);
    return { ok: false, reason: "no_subscription", errors: byAlias.body?.errors };
  }

  return postOneSignal(apiKey, {
    ...base,
    include_subscription_ids: subscriptionIds,
  });
}

export async function registerPushDevice(supabase, userId, subscriptionId) {
  const id = String(subscriptionId ?? "").trim();
  if (!id) throw new ServiceError("Suscripción inválida.");

  const { data: current, error: readErr } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .maybeSingle();
  if (readErr) throw new ServiceError(readErr.message, 500);

  const settings = current?.settings ?? {};
  const existing = Array.isArray(settings.onesignal_subscription_ids)
    ? settings.onesignal_subscription_ids.filter(Boolean)
    : [];
  const nextIds = [id, ...existing.filter((entry) => entry !== id)].slice(0, MAX_STORED_SUBSCRIPTIONS);

  const { error } = await supabase
    .from("profiles")
    .update({ settings: { ...settings, onesignal_subscription_ids: nextIds } })
    .eq("id", userId);
  if (error) throw new ServiceError(error.message, 400);

  return { ok: true, subscription_ids: nextIds };
}

export async function getPushStatus() {
  return {
    subscribed: null,
    push_configured: isPushConfigured(),
    service_role_configured: Boolean(createServiceSupabaseClient()),
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
  const path = messagePath(senderId);

  await sendToUser(serviceSb, recipientId, {
    title: senderName || "Nuevo mensaje",
    body: short || "Tienes un mensaje nuevo",
    url: pushUrl(origin, path),
    path,
    type: PushType.MESSAGE,
    tag: `message-${senderId}`,
  });
}

export async function notifyConnectionRequest(addresseeId, { requesterId, requesterName }) {
  const serviceSb = createServiceSupabaseClient();
  if (!serviceSb || !isPushConfigured()) return;

  const prefs = await loadNotificationPrefs(serviceSb, addresseeId);
  if (!prefs.connection_requests) return;

  const origin = primaryWebOrigin();
  const path = networkPath();
  await sendToUser(serviceSb, addresseeId, {
    title: "Solicitud de contacto",
    body: `${requesterName || "Alguien"} quiere agregarte a su red`,
    url: pushUrl(origin, path),
    path,
    type: PushType.CONNECTION_REQUEST,
    tag: `connection-request-${requesterId}`,
  });
}

export async function notifyProspectShared(recipientId, { ownerId, ownerName, prospectId, prospectName }) {
  const serviceSb = createServiceSupabaseClient();
  if (!serviceSb || !isPushConfigured()) return;

  const prefs = await loadNotificationPrefs(serviceSb, recipientId);
  if (!prefs.shared_prospects) return;

  const origin = primaryWebOrigin();
  const label = prospectName || "un expediente";
  const path = sharedProspectPath(ownerId, prospectId);
  await sendToUser(serviceSb, recipientId, {
    title: "Expediente compartido",
    body: `${ownerName || "Un contacto"} compartió «${label}» contigo`,
    url: pushUrl(origin, path),
    path,
    type: PushType.SHARED_PROSPECT,
    tag: `shared-prospect-${prospectId}`,
  });
}

export async function notifyConnectionAccepted(requesterId, { peerId, peerName }) {
  const serviceSb = createServiceSupabaseClient();
  if (!serviceSb || !isPushConfigured()) return;

  const prefs = await loadNotificationPrefs(serviceSb, requesterId);
  if (!prefs.connection_accepted) return;

  const origin = primaryWebOrigin();
  const path = contactPath(peerId);
  await sendToUser(serviceSb, requesterId, {
    title: "Solicitud aceptada",
    body: `${peerName || "Tu contacto"} aceptó tu solicitud`,
    url: pushUrl(origin, path),
    path,
    type: PushType.CONNECTION_ACCEPTED,
    tag: `connection-accepted-${peerId}`,
  });
}

/**
 * Aviso de seguridad: sesión cerrada en otro dispositivo.
 * No respeta prefs de usuario (debe llegar aunque estén silenciadas otras notifs).
 */
export async function notifySessionRevoked(userId) {
  if (!userId || !isPushConfigured()) return { ok: false, reason: "not_configured" };
  const serviceSb = createServiceSupabaseClient();
  if (!serviceSb) return { ok: false, reason: "no_service_role" };

  const origin = primaryWebOrigin();
  const path = "/login";
  return sendToUser(serviceSb, userId, {
    title: "Sesión cerrada",
    body: "Tu cuenta se cerró en otro dispositivo. Vuelve a iniciar sesión si fuiste tú.",
    url: pushUrl(origin, path),
    path,
    type: PushType.SESSION_REVOKED,
    tag: `session-revoked-${userId}`,
  });
}

// Compatibilidad con rutas antiguas (VAPID / web-push).
export async function savePushSubscription() {
  return { ok: true };
}

export async function removePushSubscription() {
  return { ok: true };
}
