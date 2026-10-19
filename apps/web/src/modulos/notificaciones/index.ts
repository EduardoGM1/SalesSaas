/**
 * Fachada pública — notificaciones (web).
 * OneSignal (SDK, service worker, optIn) sigue fuera del módulo: lib/onesignal.js, push-*.
 */
export * from "./fachada-node.js";

export type { NotificacionTipo, NotificacionPayload } from "./dominio/notificacion-payload.ts";
export type { ToastOptions, ToastIconKey } from "./servicios/toast.ts";
export { toast } from "./fachada-toast.js";
export {
  getNotificationPrefs,
  isNotificacionTipoEnabled,
  isNotificationTypeEnabled,
  presentarNotificacion,
  presentInAppNotification,
  presentFromPushNotification,
} from "./servicios/in-app-notifications.js";
export {
  maybeRequestReminderDigest,
  maybeFlushScheduledReminders,
  startScheduledReminderFlushLoop,
} from "./servicios/reminder-digest.js";
export { scheduleReminderPush, localReminderToIso } from "./servicios/schedule-reminder-push.js";
export { Toaster } from "./ui/toaster.jsx";
export { InAppNotificationsCoordinator } from "./ui/in-app-notifications-coordinator.jsx";
export { NotificationsSettings } from "./ui/notifications-settings.jsx";
