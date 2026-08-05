/**
 * Controller de expedientes (prospects).
 * Responsabilidad: validar input HTTP y delegar al service.
 * Sin lógica de negocio.
 */
import * as prospectsService from "../services/prospects-service.js";
import { parseLimitOffset } from "../lib/http.js";

export async function listarExpedientes(auth, query) {
  const paging = parseLimitOffset(query);
  return prospectsService.listProspects(auth.supabase, auth.userId, {
    ...paging,
    status: query.status,
  });
}

export async function crearExpediente(auth, body) {
  return prospectsService.createProspect(auth.supabase, auth.userId, body);
}

export async function obtenerExpediente(auth, id) {
  return prospectsService.getProspect(auth.supabase, auth.userId, id);
}

export async function actualizarExpediente(auth, id, body) {
  return prospectsService.updateProspect(auth.supabase, auth.userId, id, body);
}

export async function eliminarExpediente(auth, id) {
  return prospectsService.deleteProspect(auth.supabase, auth.userId, id);
}
