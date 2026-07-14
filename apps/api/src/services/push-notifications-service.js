import { createServiceSupabaseClient } from "../lib/supabase-server.js";
import { primaryWebOrigin } from "../lib/origins.js";
import { ServiceError } from "../lib/service-error.js";
import { pullAll } from "@salesapp/shared/data/sync.js";
import {
  PushType,
  calendarPath,
  contactPath,
  messagePath,
  networkPath,
  pushUrl,
  salesPath,
  sharedProspectPath,
  sharedProspectSectionPath,
} from "@salesapp/shared/push/notification-targets.js";
import { collectReminders } from "../lib/reminders.js";

const ONESIGNAL_API = "https://api.onesignal.com/notifications";
const MAX_STORED_SUBSCRIPTIONS = 5;
const SECTION_CHANGE_COOLDOWN_MS = 30_000;
/** Evita spamear digests operativos el mismo día (~20h). */
const REMINDER_DIGEST_COOLDOWN_MS = 20 * 60 * 60 * 1000;

const SECTION_LABELS = {
  detail: "Expediente",
  survey: "Survey",
  vacaciones: "Proyección de Vacaciones",
  worksheet: "Worksheet",
};

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
    follow_up_reminders: notifications.follow_up_reminders !== false,
    sales_to_process: notifications.sales_to_process === true,
    scheduled_notes: notifications.scheduled_notes !== false,
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

async function claimNotificationCooldown(serviceSb, key, windowMs = SECTION_CHANGE_COOLDOWN_MS) {
  const { data } = await serviceSb
    .from("notification_cooldowns")
    .select("last_sent_at")
    .eq("key", key)
    .maybeSingle();
  if (data?.last_sent_at) {
    const elapsed = Date.now() - new Date(data.last_sent_at).getTime();
    if (elapsed < windowMs) return false;
  }
  const now = new Date().toISOString();
  const { error } = await serviceSb
    .from("notification_cooldowns")
    .upsert({ key, last_sent_at: now }, { onConflict: "key" });
  if (error) {
    console.warn("[onesignal] cooldown upsert:", error.message);
    return true;
  }
  return true;
}

/**
 * Push a colaboradores (owner + shares) cuando alguien guarda un apartado.
 * Agrupa por recipient+prospect+section en ventana de 30s.
 */
export async function notifyProspectSectionChanged({
  actorId,
  actorName,
  prospectId,
  ownerId,
  section = "detail",
  recipientIds = [],
}) {
  const serviceSb = createServiceSupabaseClient();
  if (!serviceSb || !isPushConfigured()) return;
  if (!actorId || !prospectId || !ownerId) return;

  const sectionKey = SECTION_LABELS[section] ? section : "detail";
  const sectionLabel = SECTION_LABELS[sectionKey];
  const origin = primaryWebOrigin();
  const path = sharedProspectSectionPath(ownerId, prospectId, sectionKey);
  const uniqueRecipients = [...new Set((recipientIds || []).filter((id) => id && id !== actorId))];

  await Promise.all(uniqueRecipients.map(async (recipientId) => {
    const prefs = await loadNotificationPrefs(serviceSb, recipientId);
    if (!prefs.shared_prospects) return;

    const tag = `prospect-change-${recipientId}-${prospectId}-${sectionKey}`;
    const allowed = await claimNotificationCooldown(serviceSb, tag);
    if (!allowed) return;

    await sendToUser(serviceSb, recipientId, {
      title: "Cambios en expediente",
      body: `${actorName || "Alguien"} realizó cambios en ${sectionLabel}`,
      url: pushUrl(origin, path),
      path,
      type: PushType.PROSPECT_SECTION_CHANGED,
      tag,
    });
  }));
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

/**
 * Digest diario de recordatorios operativos (follow-ups, ventas por procesar, notas).
 * Pensado para dispararse al volver a primer plano; cooldown por tipo/día.
 */
export async function digestOperationalReminders(userId) {
  const serviceSb = createServiceSupabaseClient();
  if (!serviceSb || !isPushConfigured()) return { sent: 0, skipped: "not_configured" };
  if (!userId) return { sent: 0, skipped: "no_user" };

  const prefs = await loadNotificationPrefs(serviceSb, userId);
  if (!prefs.follow_up_reminders && !prefs.sales_to_process && !prefs.scheduled_notes) {
    return { sent: 0, skipped: "prefs_off" };
  }

  const today = new Date().toISOString().slice(0, 10);
  const db = await pullAll(serviceSb, userId);
  const due = collectReminders(db, { to: today }).filter(
    (r) => r.due === "today" || r.due === "overdue",
  );

  const origin = primaryWebOrigin();
  const groups = [
    {
      pref: "follow_up_reminders",
      type: "follow-up",
      pushType: PushType.FOLLOW_UP_REMINDER,
      path: calendarPath(),
      title: "Recordatorios de follow-up",
      body: (n) => (n === 1
        ? "Tienes 1 follow-up pendiente para hoy"
        : `Tienes ${n} follow-ups pendientes para hoy`),
    },
    {
      pref: "sales_to_process",
      type: "processing",
      pushType: PushType.SALES_TO_PROCESS,
      path: salesPath(),
      title: "Ventas por procesar",
      body: (n) => (n === 1
        ? "Tienes 1 venta pendiente por procesar"
        : `Tienes ${n} ventas pendientes por procesar`),
    },
    {
      pref: "scheduled_notes",
      type: "note",
      pushType: PushType.SCHEDULED_NOTE,
      path: calendarPath(),
      title: "Notas programadas",
      body: (n) => (n === 1
        ? "Tienes 1 nota programada para hoy"
        : `Tienes ${n} notas programadas para hoy`),
    },
  ];

  let sent = 0;
  for (const group of groups) {
    if (!prefs[group.pref]) continue;
    const items = due.filter((r) => r.type === group.type);
    if (!items.length) continue;

    const tag = `digest-${group.type}-${userId}-${today}`;
    const allowed = await claimNotificationCooldown(serviceSb, tag, REMINDER_DIGEST_COOLDOWN_MS);
    if (!allowed) continue;

    await sendToUser(serviceSb, userId, {
      title: group.title,
      body: group.body(items.length),
      url: pushUrl(origin, group.path),
      path: group.path,
      type: group.pushType,
      tag,
    });
    sent += 1;
  }

  return { sent };
}

// Compatibilidad con rutas antiguas (VAPID / web-push).
export async function savePushSubscription() {
  return { ok: true };
}

export async function removePushSubscription() {
  return { ok: true };
}
