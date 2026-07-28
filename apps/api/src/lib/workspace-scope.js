/**
 * Resuelve workspace activo validado (membresía) para requests de API.
 * Si 0052 no está, retorna null y los callers degradan a filtro solo user_id.
 */
import * as workspaceService from "../services/workspace-service.js";

export async function getRequestWorkspaceId(supabase, userId) {
  try {
    return await workspaceService.resolveActiveWorkspaceId(supabase, userId);
  } catch {
    return null;
  }
}

/**
 * Contexto activo: id, tipo, rol y si el gerente debe ver expedientes de la sala.
 * @returns {Promise<{ workspaceId: string|null, tipo: string|null, rol: string|null, teamScope: boolean }>}
 */
export async function getRequestWorkspaceContext(supabase, userId) {
  try {
    const list = await workspaceService.listUserWorkspaces(supabase, userId);
    const workspaceId = await workspaceService.resolveActiveWorkspaceId(supabase, userId);
    const active = list.find((w) => w.id === workspaceId) || null;
    const tipo = active?.tipo ?? null;
    const rol = active?.rol_en_workspace ?? null;
    const teamScope = tipo === "sala_de_venta" && rol === "gerente";
    return { workspaceId, tipo, rol, teamScope, active };
  } catch {
    return { workspaceId: null, tipo: null, rol: null, teamScope: false, active: null };
  }
}

/** Aplica .eq("workspace_id", id) si hay workspace activo. */
export function scopeByWorkspace(query, workspaceId) {
  if (workspaceId) return query.eq("workspace_id", workspaceId);
  return query;
}
