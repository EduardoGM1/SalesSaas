/**
 * Fachada pública — notificaciones / recordatorios (API).
 * Tramo B: solo dominio puro; rutas HTTP siguen en routes/*.
 */
export {
  extraerHoraRecordatorio,
  construirRecordatorios,
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
