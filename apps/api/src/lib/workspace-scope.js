/**
 * Resuelve workspace activo validado (membresía) para requests de API.
 * Si 0052 no está, retorna null y los callers degradan a filtro solo user_id.
 */
import * as workspaceService from "./workspace-service.js";

export async function getRequestWorkspaceId(supabase, userId) {
  try {
    return await workspaceService.resolveActiveWorkspaceId(supabase, userId);
  } catch {
    return null;
  }
}

/** Aplica .eq("workspace_id", id) si hay workspace activo. */
export function scopeByWorkspace(query, workspaceId) {
  if (workspaceId) return query.eq("workspace_id", workspaceId);
  return query;
}
