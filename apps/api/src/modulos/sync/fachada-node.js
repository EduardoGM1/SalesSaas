/**
 * Entrada pura de sync para cron y notificaciones.
 * shared/data/sync.js no se mueve.
 */
export {
  obtenerBaseDatosUsuario,
  reconciliarBaseDatosUsuario,
  purgarTombstonesExpedientes,
  SYNC_PARTIAL_MESSAGE,
} from "./servicios/sync-service.js";
export {
  obtenerSincronizacion,
  reconciliarSincronizacion,
  purgarTombstonesExpedientesCron,
} from "./controladores/sync-controller.js";
