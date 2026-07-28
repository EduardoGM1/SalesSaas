/**
 * Resuelve workspace activo validado (membresía) para requests de API.
 * Si 0052 no está, retorna null y los callers degradan a filtro solo user_id.
 */
import * as workspaceService from "../services/workspace-service.js";
import { ServiceError } from "./service-error.js";

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

function rpcMissing(error) {
  return ["42883", "PGRST202"].includes(error?.code)
    || String(error?.message || "").includes("schema cache");
}

/**
 * Autoriza una capacidad dentro del workspace activo. La API no confía en que
 * los flags o la navegación del cliente sean una frontera de seguridad.
 */
export async function requireWorkspacePermission(supabase, userId, permission, workspaceId) {
  const resolvedWorkspaceId = workspaceId || await getRequestWorkspaceId(supabase, userId);
  if (!resolvedWorkspaceId) throw new ServiceError("Workspace activo requerido.", 403);

  const { data, error } = await supabase.rpc("workspace_has_permission", {
    p_usuario_id: userId,
    p_workspace_id: resolvedWorkspaceId,
    p_clave: permission,
  });
  if (error && !rpcMissing(error)) throw new ServiceError(error.message, 500);
  if (error) {
    const { data: legacy, error: legacyError } = await supabase.rpc(
      "resolve_user_permission_keys",
      { p_usuario_id: userId },
    );
    if (legacyError || !Array.isArray(legacy) || !legacy.includes(permission)) {
      throw new ServiceError("No tienes permiso para realizar esta acción.", 403);
    }
  } else if (data !== true) {
    throw new ServiceError("No tienes permiso para realizar esta acción.", 403);
  }
  return resolvedWorkspaceId;
}

export async function requireWorkspaceFlag(supabase, userId, flag, workspaceId) {
  const resolvedWorkspaceId = workspaceId || await getRequestWorkspaceId(supabase, userId);
  if (!resolvedWorkspaceId) throw new ServiceError("Workspace activo requerido.", 403);
  const { data, error } = await supabase.rpc("resolver_workspace_flag", {
    p_clave: flag,
    p_usuario_id: userId,
    p_workspace_id: resolvedWorkspaceId,
  });
  if (error && !rpcMissing(error)) throw new ServiceError(error.message, 500);
  if (error) {
    const { data: legacy } = await supabase.rpc("resolver_flag", {
      p_clave: flag,
      p_usuario_id: userId,
    });
    if (legacy !== true) throw new ServiceError("Módulo no habilitado.", 403);
  } else if (data !== true) {
    throw new ServiceError("Módulo no habilitado.", 403);
  }
  return resolvedWorkspaceId;
}
