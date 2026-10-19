/**
 * Entrada Node sin montar routers Express (tests / scripts).
 */
export {
  extraerHoraRecordatorio,
  construirRecordatorios,
  extraerHoraRecordatorio as extractReminderTime,
  construirRecordatorios as collectReminders,
} from "./dominio/construir-recordatorios.js";
export {
  normalizarPreferenciasNotificacion,
  digestOmitidoPorPrefs,
  omitirPorPrefsRecordatorio,
} from "./dominio/preferencias-notificacion.js";
export {
  PushType,
  resolvePushPathFromPayload,
  resolverRutaPushDesdePayload,
  tipoPushDeRecordatorio,
  calendarPath,
  salesPath,
  networkPath,
  pushUrl,
} from "./dominio/mapeo-pushtype.js";
export {
  clasificarTipoRecordatorio,
  fechaRecordatorioValida,
  normalizarHoraRecordatorio,
  evaluarSendAt,
  construirCamposTrabajoPush,
} from "./dominio/trabajo-push-programado.js";
export { construirEtiquetaPush } from "./dominio/etiqueta-push.js";
export { construirPayloadMensajeOnesignal } from "./dominio/payload-onesignal.js";
export {
  getOneSignalAppId,
  getSafariWebId,
  isPushConfigured,
  registerPushDevice,
  getPushStatus,
  getPushDiagnosticsForUser,
  notifyNewMessage,
  notifyConnectionRequest,
  notifyProspectShared,
  notifyProspectSectionChanged,
  notifyCloserAssigned,
  notifyProspectTransferred,
  notifyConnectionAccepted,
  notifySupportReply,
  notifySessionRevoked,
  digestOperationalReminders,
  scheduleOperationalReminder,
  flushDueScheduledPushes,
  savePushSubscription,
  removePushSubscription,
} from "./servicios/push-notificaciones.js";
