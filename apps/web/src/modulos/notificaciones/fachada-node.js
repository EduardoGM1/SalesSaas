/** Entrada pública sin UI, TS ni alias @/ (dominio + cliente HTTP): scripts, tests de Node y shims de lib/. */
export { notificationsApi } from "./api/notifications-api.js";
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
export { datosRespaldoDesdePush } from "./dominio/datos-respaldo-push.js";
export {
  VENTANA_AGRUPACION_MS,
  TONO_POR_ICONO,
  iconoToastDesdePayload,
  claveAgrupacion,
  opcionesToastDesdePayload,
} from "./dominio/presentacion-toast.js";
export {
  MAX_TOASTS_VISIBLES,
  duracionToast,
  toastEsVacio,
  armarItemToast,
} from "./dominio/item-toast.js";
export { armarProgramacionRecordatorio } from "./dominio/programacion-recordatorio.js";
