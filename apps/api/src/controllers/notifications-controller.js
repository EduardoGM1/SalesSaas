/**
 * HTTP de push / OneSignal. Config 503 si falta APP ID (se resuelve en la ruta).
 */
import * as pushService from "../services/push-notifications-service.js";

export function payloadConfigPush() {
  return {
    appId: pushService.getOneSignalAppId(),
    safariWebId: pushService.getSafariWebId(),
    provider: "onesignal",
    configured: pushService.isPushConfigured(),
    serviceWorkerPath: "onesignal/OneSignalSDKWorker.js",
    serviceWorkerScope: "/onesignal/",
  };
}

export async function obtenerEstadoPush() {
  return pushService.getPushStatus();
}

export async function obtenerDiagnosticoPush(auth) {
  return pushService.getPushDiagnosticsForUser(auth.supabase, auth.userId);
}

export async function registrarDispositivo(auth, _req, body) {
  const subscriptionId = body.subscription_id ?? body.subscriptionId;
  return pushService.registerPushDevice(auth.supabase, auth.userId, subscriptionId);
}

export async function digerirRecordatorios(auth, req) {
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  return pushService.digestOperationalReminders(auth.userId, {
    timezoneOffsetMinutes: body.timezone_offset_minutes ?? body.timezoneOffsetMinutes,
  });
}

export async function programarRecordatorio(auth, _req, body) {
  return pushService.scheduleOperationalReminder(auth.userId, body);
}

export async function vaciarRecordatoriosPropios(auth) {
  return pushService.flushDueScheduledPushes({ userId: auth.userId, limit: 20 });
}

export async function vaciarRecordatoriosCron() {
  return pushService.flushDueScheduledPushes({ limit: 80 });
}
