/**
 * Resuelve workspace activo validado (membresía) para requests de API.
 * Si 0052 no está, retorna null y los callers degradan a filtro solo user_id.
 */
import * as workspaceService from "../services/workspace-service.js";
import { ServiceError } from "./service-error.js";
import {
  flagDeniedError,
  flagsUnavailableError,
  permissionDeniedError,
  permissionsUnavailableError,
  rpcResolverWorkspaceFlag,
  rpcWorkspaceHasPermission,
  workspaceAccessDeniedError,
} from "./workspace-permission-rpc.js";

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
    let teamScope = false;
    if (tipo === "sala_de_venta" && workspaceId) {
      try {
        teamScope = await rpcWorkspaceHasPermission(
          supabase,
          userId,
          workspaceId,
          "dashboard:ver_equipo",
        );
      } catch {
        teamScope = false;
      }
    }
    return { workspaceId, tipo, rol, teamScope, active };
  } catch {
    return { workspaceId: null, tipo: null, rol: null, teamScope: false, active: null };
  }
}

/** Aplica .eq("workspace_id", id); falla cerrado si no hay workspace activo. */
export function scopeByWorkspace(query, workspaceId) {
  if (!workspaceId) {
    throw new ServiceError("Workspace activo requerido.", 403);
  }
  return query.eq("workspace_id", workspaceId);
}

async function loadWorkspaceTipo(supabase, workspaceId, unavailableError = permissionsUnavailableError) {
  let result;
  try {
    result = await supabase
      .from("workspaces")
      .select("tipo")
      .eq("id", workspaceId)
      .maybeSingle();
  } catch {
    throw unavailableError();
  }
  const { data, error } = result || {};
  if (error) throw unavailableError();
  return data?.tipo ?? null;
}

/**
 * Autoriza una capacidad dentro del workspace activo. La API no confía en que
 * los flags o la navegación del cliente sean una frontera de seguridad.
 *
 * Sala: si el RPC falla → 503 (nunca permisos globales).
 * Personal: si el RPC de workspace no existe, sí puede usar el catálogo de perfil
 * (ese es el modelo de espacio personal, no un leak cross-tenant).
 */
export async function requireWorkspacePermission(supabase, userId, permission, workspaceId) {
  const resolvedWorkspaceId = workspaceId || await getRequestWorkspaceId(supabase, userId);
  if (!resolvedWorkspaceId) throw new ServiceError("Workspace activo requerido.", 403);

  let granted;
  let rpcError = false;
  try {
    granted = await rpcWorkspaceHasPermission(supabase, userId, resolvedWorkspaceId, permission);
  } catch (err) {
    if (err instanceof ServiceError && err.status === 503) {
      rpcError = true;
      granted = false;
    } else {
      throw err;
    }
  }

  if (!rpcError) {
    if (granted === true) return resolvedWorkspaceId;
    try {
      const inWs = await supabase.rpc("user_in_workspace", {
        p_usuario_id: userId,
        p_workspace_id: resolvedWorkspaceId,
      });
      if (inWs.error) throw permissionsUnavailableError();
      if (inWs.data !== true) throw workspaceAccessDeniedError();
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      throw permissionsUnavailableError();
    }
    throw permissionDeniedError();
  }

  const tipo = await loadWorkspaceTipo(supabase, resolvedWorkspaceId);
  if (tipo === "sala_de_venta") {
    throw permissionsUnavailableError();
  }
  if (tipo == null) {
    throw workspaceAccessDeniedError();
  }

  const { data: legacy, error: legacyError } = await supabase.rpc(
    "resolve_user_permission_keys",
    { p_usuario_id: userId },
  );
  if (legacyError || !Array.isArray(legacy) || !legacy.includes(permission)) {
    throw permissionDeniedError();
  }
  return resolvedWorkspaceId;
}

/**
 * Autoriza un módulo/herramienta en el workspace activo.
 * Sala: si el RPC de flags falla → 503 (nunca resolver_flag global).
 * Personal: si el RPC de workspace no existe, sí puede usar resolver_flag
 * (catálogo de perfil, no leak cross-tenant).
 */
export async function requireWorkspaceFlag(supabase, userId, flag, workspaceId) {
  const resolvedWorkspaceId = workspaceId || await getRequestWorkspaceId(supabase, userId);
  if (!resolvedWorkspaceId) throw new ServiceError("Workspace activo requerido.", 403);

  let granted;
  let rpcError = false;
  try {
    granted = await rpcResolverWorkspaceFlag(supabase, userId, resolvedWorkspaceId, flag);
  } catch (err) {
    if (err instanceof ServiceError && err.status === 503) {
      rpcError = true;
      granted = false;
    } else {
      throw err;
    }
  }

  if (!rpcError) {
    if (granted === true) return resolvedWorkspaceId;
    throw flagDeniedError();
  }

  const tipo = await loadWorkspaceTipo(supabase, resolvedWorkspaceId, flagsUnavailableError);
  if (tipo === "sala_de_venta") {
    throw flagsUnavailableError();
  }
  if (tipo == null) {
    throw workspaceAccessDeniedError();
  }

  const { data: legacy, error: legacyError } = await supabase.rpc("resolver_flag", {
    p_clave: flag,
    p_usuario_id: userId,
  });
  if (legacyError || legacy !== true) throw flagDeniedError();
  return resolvedWorkspaceId;
}
