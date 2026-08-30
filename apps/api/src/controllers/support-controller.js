/**
 * HTTP de tickets de soporte (usuario). Admin vive en routes/admin.
 */
import * as supportService from "../services/support-service.js";

export async function crearSolicitudSoporte(auth, _req, body) {
  return supportService.createSupportRequest(auth.supabase, auth.userId, body);
}

export async function limpiarAdjuntosSoporteCron() {
  return supportService.cleanupExpiredSupportAttachments({ limit: 80 });
}
