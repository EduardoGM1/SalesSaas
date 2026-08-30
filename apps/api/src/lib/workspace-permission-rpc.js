import { ServiceError } from "./service-error.js";

/** RPC de sala caído / timeout / función ausente — no es “sin permiso”. */
export const WORKSPACE_PERMISSIONS_UNAVAILABLE = "WORKSPACE_PERMISSIONS_UNAVAILABLE";
/** Miembro de la sala sin esa clave. */
export const WORKSPACE_PERMISSION_DENIED = "WORKSPACE_PERMISSION_DENIED";
/** JWT válido pero sin membresía (ni acceso cruzado cubierto por el RPC). */
export const WORKSPACE_ACCESS_DENIED = "WORKSPACE_ACCESS_DENIED";

export const MSG_PERMISSIONS_UNAVAILABLE =
  "No se pudieron verificar los permisos de la sala. Intenta de nuevo.";
export const MSG_PERMISSION_DENIED = "No tienes permiso para realizar esta acción.";
export const MSG_WORKSPACE_ACCESS_DENIED = "No tienes acceso a este espacio.";

export function permissionsUnavailableError() {
  return new ServiceError(MSG_PERMISSIONS_UNAVAILABLE, 503, WORKSPACE_PERMISSIONS_UNAVAILABLE);
}

export function permissionDeniedError() {
  return new ServiceError(MSG_PERMISSION_DENIED, 403, WORKSPACE_PERMISSION_DENIED);
}

export function workspaceAccessDeniedError() {
  return new ServiceError(MSG_WORKSPACE_ACCESS_DENIED, 403, WORKSPACE_ACCESS_DENIED);
}

/** RPC de flags de sala caído — no es “módulo apagado”. */
export const WORKSPACE_FLAGS_UNAVAILABLE = "WORKSPACE_FLAGS_UNAVAILABLE";
export const WORKSPACE_FLAG_DENIED = "WORKSPACE_FLAG_DENIED";
export const MSG_FLAGS_UNAVAILABLE =
  "No se pudieron verificar los módulos de la sala. Intenta de nuevo.";
export const MSG_FLAG_DENIED = "Módulo no habilitado.";

export function flagsUnavailableError() {
  return new ServiceError(MSG_FLAGS_UNAVAILABLE, 503, WORKSPACE_FLAGS_UNAVAILABLE);
}

export function flagDeniedError() {
  return new ServiceError(MSG_FLAG_DENIED, 403, WORKSPACE_FLAG_DENIED);
}

function rpcFailed(error) {
  return Boolean(error);
}

/**
 * workspace_has_permission. Cualquier fallo de infraestructura lanza 503;
 * no cae a permisos globales.
 */
export async function rpcWorkspaceHasPermission(supabase, userId, workspaceId, clave) {
  let result;
  try {
    result = await supabase.rpc("workspace_has_permission", {
      p_usuario_id: userId,
      p_workspace_id: workspaceId,
      p_clave: clave,
    });
  } catch {
    throw permissionsUnavailableError();
  }
  const { data, error } = result || {};
  if (rpcFailed(error)) throw permissionsUnavailableError();
  return data === true;
}

/**
 * effective_workspace_permissions. Fallo / no-array → 503, nunca [].
 * [] vacío con RPC OK es un resultado legítimo (p. ej. asistente sin delegar).
 */
export async function rpcEffectiveWorkspacePermissions(supabase, userId, workspaceId) {
  let result;
  try {
    result = await supabase.rpc("effective_workspace_permissions", {
      p_usuario_id: userId,
      p_workspace_id: workspaceId,
    });
  } catch {
    throw permissionsUnavailableError();
  }
  const { data, error } = result || {};
  if (rpcFailed(error) || !Array.isArray(data)) throw permissionsUnavailableError();
  return data;
}

/**
 * Sesión en sala: si el RPC falla, keys vacías + status unavailable
 * (la UI muestra reintentar, no “no tienes permiso”).
 */
export async function resolveSalaSessionPermissionKeys(supabase, userId, workspaceId) {
  try {
    const keys = await rpcEffectiveWorkspacePermissions(supabase, userId, workspaceId);
    return { keys, status: "ok" };
  } catch (err) {
    if (err instanceof ServiceError && err.code === WORKSPACE_PERMISSIONS_UNAVAILABLE) {
      return { keys: [], status: "unavailable" };
    }
    throw err;
  }
}

/**
 * resolver_workspace_flag. Cualquier fallo de infraestructura lanza 503;
 * no cae a resolver_flag global.
 */
export async function rpcResolverWorkspaceFlag(supabase, userId, workspaceId, clave) {
  let result;
  try {
    result = await supabase.rpc("resolver_workspace_flag", {
      p_clave: clave,
      p_usuario_id: userId,
      p_workspace_id: workspaceId,
    });
  } catch {
    throw flagsUnavailableError();
  }
  const { data, error } = result || {};
  if (rpcFailed(error)) throw flagsUnavailableError();
  return data === true;
}
