/**
 * Fachada pública — notificaciones (web). Tramo B: dominio puro.
 * OneSignal / SW / coordinators siguen fuera (Tramo A).
 */
export { fechaHoraLocalAIso } from "./dominio/fecha-recordatorio-local.js";
export {
  debeRespetarCooldown,
  VENTANA_DIGEST_MS,
  VENTANA_FLUSH_MS,
  CLAVE_DIGEST_LOCAL,
  CLAVE_FLUSH_LOCAL,
} from "./dominio/cooldown-digest.js";
export {
  normalizarPreferenciasNotificacion,
  preferenciaHabilitadaParaTipo,
  TIPO_A_PREF,
} from "./dominio/preferencias-notificacion.js";
export {
  PushType,
  PUSH_A_TIPO,
  tipoInAppDesdePushType,
} from "./dominio/mapeo-pushtype.js";
export { truncar, armarNotificacion } from "./dominio/armar-notificacion.js";
