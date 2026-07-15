import { createHash } from "node:crypto";
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
/** OneSignal: web_push_topic / collapse_id máx. 64 chars. */
const MAX_PUSH_TAG_LEN = 64;

const SECTION_LABELS = {
  detail: "Expediente",
  survey: "Survey",
  vacaciones: "Proyección de Vacaciones",
  worksheet: "Worksheet",
};

/** Tag corto y estable (mismo límite que mensajes: ≤64). */
function pushTag(prefix, ...parts) {
  const safePrefix = String(prefix || "n").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 20);
  const raw = parts.map((p) => String(p ?? "")).filter(Boolean).join("-");
  const full = raw ? `${safePrefix}-${raw}` : safePrefix;
  if (full.length <= MAX_PUSH_TAG_LEN) return full;
  const hash = createHash("sha256").update(full).digest("hex").slice(0, 12);
  return `${safePrefix}-${hash}`.slice(0, MAX_PUSH_TAG_LEN);
}

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

function buildMessagePayload(appId, { title, body, url, path, type, tag, sendAfter }) {
  const appPath = path || "/";
  const topic = pushTag(tag || type || "push");
  const payload = {
    app_id: appId,
    headings: { en: title, es: title },
    contents: { en: body, es: body },
    url,
    // Mismos campos que mensajes/contactos (topic ≤64).
    web_push_topic: topic,
    collapse_id: topic,
    data: { url, path: appPath, type: type || null },
  };
  if (sendAfter) payload.send_after = sendAfter;
  return payload;
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
  const messageId = String(body?.id ?? "").trim();
  const hasErrors = Array.isArray(body.errors)
    ? body.errors.length > 0
    : Boolean(body.errors);
  // OneSignal: id vacío = aceptado pero 0 suscriptores ("No recipients" en dashboard).
  const ok = res.ok && messageId.length > 0 && !hasErrors;
  if (!ok) {
    console.warn("[onesignal] Envío fallido:", {
      status: res.status,
      messageId: messageId || null,
      errors: body.errors,
      recipients: body.recipients,
      send_after: payload.send_after || null,
      topic: payload.web_push_topic || null,
      targeting: payload.include_subscription_ids
        ? "subscription_ids"
        : payload.include_aliases
          ? "external_id"
          : payload.included_segments || "other",
    });
  }
  return { ok, body, messageId: messageId || null };
}

async function sendToUser(serviceSb, userId, message) {
  const appId = getOneSignalAppId();
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!appId || !apiKey) return { ok: false, reason: "not_configured" };

  const base = buildMessagePayload(appId, message);
  const subscriptionIds = await loadSubscriptionIds(serviceSb, userId);
  const errors = [];

  // 1) IDs de suscripción guardados al activar push en el dispositivo (Android sin login OK).
  if (subscriptionIds.length) {
    const bySub = await postOneSignal(apiKey, {
      ...base,
      target_channel: "push",
      include_subscription_ids: subscriptionIds,
    });
    if (bySub.ok) return bySub;
    if (bySub.body?.errors) errors.push(...(Array.isArray(bySub.body.errors) ? bySub.body.errors : [bySub.body.errors]));
  }

  // 2) external_id (OneSignal.login) — todos los dispositivos del usuario.
  const byAlias = await postOneSignal(apiKey, {
    ...base,
    target_channel: "push",
    include_aliases: { external_id: [String(userId)] },
  });
  if (byAlias.ok) return byAlias;
  if (byAlias.body?.errors) errors.push(...(Array.isArray(byAlias.body.errors) ? byAlias.body.errors : [byAlias.body.errors]));

  console.warn("[onesignal] Sin destinatarios para usuario", userId, {
    subscription_ids: subscriptionIds,
    errors: errors.length ? errors : byAlias.body?.errors,
  });

  return {
    ok: false,
    reason: subscriptionIds.length ? "send_failed" : "no_subscription",
    errors,
  };
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

/** Diagnóstico de push para soporte (usuario autenticado). */
export async function getPushDiagnosticsForUser(supabase, userId) {
  const serviceSb = createServiceSupabaseClient();
  const sb = serviceSb || supabase;
  const settings = await loadProfileSettings(sb, userId);
  const subscriptionIds = Array.isArray(settings.onesignal_subscription_ids)
    ? settings.onesignal_subscription_ids.filter(Boolean)
    : [];
  const prefs = await loadNotificationPrefs(sb, userId);
  return {
    external_id: String(userId),
    stored_subscription_ids: subscriptionIds,
    subscription_count: subscriptionIds.length,
    push_configured: isPushConfigured(),
    notification_prefs: prefs,
    hint: subscriptionIds.length
      ? "Si no llegan push, verifica en OneSignal Audience que la suscripción esté Subscribed y que external_id coincida."
      : "Sin subscription_id guardado: el dispositivo no completó registerDevice tras activar notificaciones.",
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
 * No sustituye avisos a hora exacta (ver scheduleOperationalReminder).
 */
export async function digestOperationalReminders(userId, { timezoneOffsetMinutes } = {}) {
  const serviceSb = createServiceSupabaseClient();
  if (!serviceSb || !isPushConfigured()) return { sent: 0, skipped: "not_configured" };
  if (!userId) return { sent: 0, skipped: "no_user" };

  const prefs = await loadNotificationPrefs(serviceSb, userId);
  if (!prefs.follow_up_reminders && !prefs.sales_to_process && !prefs.scheduled_notes) {
    return { sent: 0, skipped: "prefs_off" };
  }

  const offset = Number.isFinite(Number(timezoneOffsetMinutes))
    ? Number(timezoneOffsetMinutes)
    : 0;
  const localNow = new Date(Date.now() - offset * 60_000);
  const today = localNow.toISOString().slice(0, 10);
  const db = await pullAll(serviceSb, userId);
  const due = collectReminders(db, { to: today, today }).filter(
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
    // Digest solo para ítems sin hora (los con hora van por scheduleOperationalReminder).
    const items = due.filter((r) => r.type === group.type && !r.time);
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
      tag: pushTag("dig", group.type, today),
    });
    sent += 1;
  }

  // Catch-up: follow-ups/notas con hora ya vencida hoy (p. ej. creados antes del schedule).
  const nowShifted = localNow.getTime();
  for (const item of due) {
    if (!item.time) continue;
    const isFollow = item.type === "follow-up";
    const isNote = item.type === "note";
    if (isFollow && !prefs.follow_up_reminders) continue;
    if (isNote && !prefs.scheduled_notes) continue;
    if (!isFollow && !isNote) continue;

    const [hh, mm] = item.time.split(":").map(Number);
    const [y, mo, d] = item.date.split("-").map(Number);
    // Misma escala que localNow (UTC components = hora local).
    const dueShifted = Date.UTC(y, mo - 1, d, hh, mm, 0);
    const age = nowShifted - dueShifted;
    if (age < 0 || age > 6 * 60 * 60 * 1000) continue;

    const cooldownKey = `catchup-${item.type}-${userId}-${item.date}-${item.time}-${item.id}`;
    const allowed = await claimNotificationCooldown(serviceSb, cooldownKey, REMINDER_DIGEST_COOLDOWN_MS);
    if (!allowed) continue;

    const title = isFollow ? "Recordatorio de follow-up" : "Nota programada";
    const preview = String(item.note || "").replace(/^\d{1,2}:\d{2}\s*·\s*/, "").trim();
    await sendToUser(serviceSb, userId, {
      title,
      body: preview
        ? (preview.length > 120 ? `${preview.slice(0, 120)}…` : preview)
        : (isFollow ? `Follow-up de las ${item.time}` : `Nota de las ${item.time}`),
      url: pushUrl(origin, calendarPath()),
      path: calendarPath(),
      type: isFollow ? PushType.FOLLOW_UP_REMINDER : PushType.SCHEDULED_NOTE,
      tag: pushTag(isFollow ? "cfu" : "cnote", item.date, item.time, item.id),
    });
    sent += 1;
  }

  return { sent };
}

/**
 * Encola un push a hora exacta. NO usa OneSignal send_after (web push lo ignora o adelanta).
 * El envío real lo hace flushDueScheduledPushes() — mismo canal inmediato que mensajes.
 */
export async function scheduleOperationalReminder(userId, body = {}) {
  const serviceSb = createServiceSupabaseClient();
  if (!serviceSb || !isPushConfigured()) {
    throw new ServiceError("Notificaciones push no configuradas.", 503);
  }
  if (!userId) throw new ServiceError("Usuario requerido.", 401);

  const kind = String(body.type ?? body.kind ?? "").trim();
  const date = String(body.date ?? "").trim();
  const timeRaw = String(body.time ?? "").trim();
  const note = String(body.note ?? "").trim();
  const sendAtRaw = body.send_at ?? body.sendAt ?? null;
  const entryKey = String(body.entry_key ?? body.entryKey ?? body.ts ?? Date.now());

  const isFollow = kind === "follow-up" || kind === "follow";
  const isNote = kind === "note" || kind === "nota" || kind === "scheduled_note";
  if (!isFollow && !isNote) {
    throw new ServiceError("Tipo de recordatorio no válido.", 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ServiceError("Fecha inválida.", 400);
  }

  const prefs = await loadNotificationPrefs(serviceSb, userId);
  if (isFollow && !prefs.follow_up_reminders) return { ok: true, skipped: "prefs_off" };
  if (isNote && !prefs.scheduled_notes) return { ok: true, skipped: "prefs_off" };

  const time = /^\d{1,2}:\d{2}$/.test(timeRaw) ? timeRaw.padStart(5, "0") : "09:00";
  const sendAt = sendAtRaw ? new Date(String(sendAtRaw)) : null;
  if (!sendAt || Number.isNaN(sendAt.getTime())) {
    throw new ServiceError("send_at inválido.", 400);
  }

  const now = Date.now();
  const delta = sendAt.getTime() - now;
  if (delta < -2 * 60 * 60 * 1000) {
    return { ok: true, skipped: "too_late" };
  }

  const origin = primaryWebOrigin();
  const path = calendarPath();
  const title = isFollow ? "Recordatorio de follow-up" : "Nota programada";
  const preview = note
    ? (note.length > 120 ? `${note.slice(0, 120)}…` : note)
    : (isFollow ? "Tienes un follow-up programado" : "Tienes una nota programada");
  const bodyText = isFollow
    ? (note ? `Follow-up: ${preview}` : `Follow-up a las ${time}`)
    : (note ? `Nota: ${preview}` : `Nota programada a las ${time}`);
  const pushType = isFollow ? PushType.FOLLOW_UP_REMINDER : PushType.SCHEDULED_NOTE;
  const tag = pushTag(isFollow ? "fu" : "note", date, time.replace(":", ""), entryKey);

  // Cancela jobs pendientes previos del mismo entry (reprogramación).
  await serviceSb
    .from("scheduled_push_jobs")
    .update({ status: "cancelled" })
    .eq("user_id", userId)
    .eq("entry_key", entryKey)
    .eq("status", "pending");

  const { data: job, error: insertErr } = await serviceSb
    .from("scheduled_push_jobs")
    .insert({
      user_id: userId,
      send_at: sendAt.toISOString(),
      push_type: pushType,
      title,
      body: bodyText,
      path,
      tag,
      entry_key: entryKey,
      status: "pending",
    })
    .select("id, send_at")
    .single();

  if (insertErr) {
    throw new ServiceError(insertErr.message || "No se pudo encolar el aviso.", 400);
  }

  // Solo enviar ya si la hora ya pasó; si es futuro, esperar flush/cron (evita push al crear).
  if (delta <= 0) {
    const result = await sendToUser(serviceSb, userId, {
      title,
      body: bodyText,
      url: pushUrl(origin, path),
      path,
      type: pushType,
      tag,
    });
    await serviceSb
      .from("scheduled_push_jobs")
      .update({
        status: result?.ok ? "sent" : "failed",
        sent_at: result?.ok ? new Date().toISOString() : null,
        attempts: 1,
        last_error: result?.ok ? null : (result?.reason || "send_failed"),
      })
      .eq("id", job.id);

    if (!result?.ok) {
      throw new ServiceError(
        result?.reason === "no_subscription"
          ? "No hay dispositivo con push activo. Activa las notificaciones en Configuración."
          : "No se pudo enviar el aviso push.",
        502,
      );
    }
    return {
      ok: true,
      scheduled: false,
      send_at: sendAt.toISOString(),
      job_id: job.id,
    };
  }

  return {
    ok: true,
    scheduled: true,
    send_at: sendAt.toISOString(),
    job_id: job.id,
  };
}

/**
 * Envía jobs pendientes cuya hora ya llegó (mismo sendToUser que mensajes).
 * Pensado para cron cada minuto + poll del cliente.
 */
export async function flushDueScheduledPushes({ limit = 40, userId = null } = {}) {
  const serviceSb = createServiceSupabaseClient();
  if (!serviceSb || !isPushConfigured()) {
    return { sent: 0, skipped: "not_configured" };
  }

  const nowIso = new Date().toISOString();
  let query = serviceSb
    .from("scheduled_push_jobs")
    .select("id, user_id, push_type, title, body, path, tag, attempts")
    .eq("status", "pending")
    .lte("send_at", nowIso)
    .order("send_at", { ascending: true })
    .limit(Math.min(Math.max(Number(limit) || 40, 1), 100));

  if (userId) query = query.eq("user_id", userId);

  const { data: jobs, error } = await query;

  if (error) {
    console.warn("[scheduled-push] flush select:", error.message);
    return { sent: 0, skipped: "query_error", error: error.message };
  }
  if (!jobs?.length) return { sent: 0 };

  const origin = primaryWebOrigin();
  let sent = 0;

  for (const job of jobs) {
    const prefs = await loadNotificationPrefs(serviceSb, job.user_id);
    const isFollow = job.push_type === PushType.FOLLOW_UP_REMINDER;
    const isNote = job.push_type === PushType.SCHEDULED_NOTE;
    if (isFollow && !prefs.follow_up_reminders) {
      await serviceSb.from("scheduled_push_jobs").update({ status: "cancelled" }).eq("id", job.id);
      continue;
    }
    if (isNote && !prefs.scheduled_notes) {
      await serviceSb.from("scheduled_push_jobs").update({ status: "cancelled" }).eq("id", job.id);
      continue;
    }

    const path = job.path || calendarPath();
    const result = await sendToUser(serviceSb, job.user_id, {
      title: job.title,
      body: job.body,
      url: pushUrl(origin, path),
      path,
      type: job.push_type,
      tag: job.tag,
    });

    const attempts = (job.attempts || 0) + 1;
    if (result?.ok) {
      await serviceSb
        .from("scheduled_push_jobs")
        .update({ status: "sent", sent_at: new Date().toISOString(), attempts, last_error: null })
        .eq("id", job.id);
      sent += 1;
    } else {
      const giveUp = attempts >= 5;
      const patch = {
        status: giveUp ? "failed" : "pending",
        attempts,
        last_error: result?.reason || "send_failed",
      };
      if (!giveUp) patch.send_at = new Date(Date.now() + 60_000).toISOString();
      await serviceSb.from("scheduled_push_jobs").update(patch).eq("id", job.id);
    }
  }

  return { sent, checked: jobs.length };
}

// Compatibilidad con rutas antiguas (VAPID / web-push).
export async function savePushSubscription() {
  return { ok: true };
}

export async function removePushSubscription() {
  return { ok: true };
}
