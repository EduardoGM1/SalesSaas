/**
 * Controller de sincronización bulk.
 * Orquesta auth context → service (nombres de negocio en español).
 */
import * as syncService from "../services/sync-service.js";

export async function obtenerSincronizacion(auth) {
  return syncService.obtenerBaseDatosUsuario(auth.supabase, auth.userId);
}

export async function reconciliarSincronizacion(auth, incoming) {
  return syncService.reconciliarBaseDatosUsuario(auth.supabase, auth.userId, incoming);
}
