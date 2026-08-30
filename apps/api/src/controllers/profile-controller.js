/**
 * HTTP de perfil y presencia.
 */
import * as perfilService from "../services/profile-service.js";

export async function obtenerPerfil(auth) {
  return perfilService.obtenerPerfil(auth.supabase, auth.userId);
}

export async function actualizarPerfil(auth, _req, body) {
  return perfilService.actualizarPerfil(auth.supabase, auth.userId, body);
}

export async function marcarPresenciaOffline(auth) {
  return perfilService.marcarPresenciaOffline(auth.supabase, auth.userId);
}
