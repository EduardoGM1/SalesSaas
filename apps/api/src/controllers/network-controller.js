/**
 * HTTP de red de contactos. El rate limit de search está en la ruta.
 */
import * as networkService from "../services/network-service.js";
import * as sharingService from "../services/sharing-service.js";

export async function buscarUsuarios(auth, req) {
  return networkService.searchUsers(auth.supabase, auth.userId, req.query.q, Number(req.query.limit) || 20);
}

export async function listarConexiones(auth, req) {
  return networkService.listConnections(auth.supabase, auth.userId, { status: req.query.status });
}

export async function obtenerContacto(auth, req) {
  return networkService.getConnectionWithContact(auth.supabase, auth.userId, req.params.contactId);
}

export async function listarSharesConContacto(auth, req) {
  return sharingService.listSharesWithContact(auth.supabase, auth.userId, req.params.contactId);
}

export async function enviarSolicitudConexion(auth, _req, body) {
  return networkService.sendConnectionRequest(auth.supabase, auth.userId, body.addressee_id);
}

export async function actualizarEstadoConexion(auth, req, body) {
  return networkService.updateConnectionStatus(auth.supabase, auth.userId, req.params.id, body.status);
}

export async function eliminarConexion(auth, req) {
  return networkService.removeConnection(auth.supabase, auth.userId, req.params.id);
}
