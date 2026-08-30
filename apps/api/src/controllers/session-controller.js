/**
 * HTTP de session / workspace activo. GET session usa envelope especial (ver rutas).
 */
import * as sessionService from "../services/session-service.js";

export async function obtenerSesion(auth) {
  return sessionService.getSession(auth.supabase, auth.userId);
}

export async function cambiarWorkspace(auth, _req, body) {
  const workspaceId = body.workspace_id ?? body.workspaceId;
  return sessionService.switchWorkspace(auth.supabase, auth.userId, workspaceId);
}

export async function obtenerSesionRealtime(auth) {
  return sessionService.getRealtimeSession(auth.supabase);
}
