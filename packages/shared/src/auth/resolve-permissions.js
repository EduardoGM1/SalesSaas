import {
  ALL_PERMISSION_KEYS,
  ADMIN_PERMISSION_KEYS,
  OVERRIDABLE_APP_FEATURES,
  VENDEDOR_DEFAULT_PERMISSIONS,
} from "./permission-catalog.js";

/**
 * Resuelve permisos finales: rol + overrides (override gana).
 * Superadmin → todos.
 *
 * @param {{
 *   is_super_admin?: boolean,
 *   role?: string,
 *   role_permission_keys?: string[],
 *   overrides?: { clave: string, otorgado: boolean }[],
 *   admin_permissions?: string[],
 *   user_permissions?: string[],
 * }} input
 * @returns {Set<string>}
 */
export function resolveUserPermissions(input = {}) {
  if (input.is_super_admin === true && input.role === "admin") {
    return new Set(ALL_PERMISSION_KEYS);
  }

  const roleKeys = Array.isArray(input.role_permission_keys) && input.role_permission_keys.length
    ? input.role_permission_keys
    : inferRoleKeysFromLegacy(input);

  const granted = new Set(roleKeys);

  const overrides = Array.isArray(input.overrides) ? input.overrides : [];
  for (const ov of overrides) {
    const key = String(ov?.clave || "").trim();
    if (!key) continue;
    if (ov.otorgado === true) granted.add(key);
    else if (ov.otorgado === false) granted.delete(key);
  }

  // Compat: user_permissions allowlist (vacío = no restringe)
  const userPerms = Array.isArray(input.user_permissions) ? input.user_permissions : null;
  if (userPerms && userPerms.length > 0) {
    for (const feat of ["sales:view_modal", "sales:view_detail", "sales:history"]) {
      if (!userPerms.includes(feat)) granted.delete(feat);
      else granted.add(feat);
    }
  }

  return granted;
}

function inferRoleKeysFromLegacy(input) {
  const keys = new Set(VENDEDOR_DEFAULT_PERMISSIONS);
  if (input.role === "admin") {
    const adminPerms = Array.isArray(input.admin_permissions) ? input.admin_permissions : [];
    for (const p of adminPerms) keys.add(p);
    for (const p of [
      "dashboard:read", "users:read", "users:deactivate", "users:activate",
      "users:export", "goals:read", "tools:analytics", "support:read",
    ]) {
      // no forzar; solo lo delegado
    }
    if (adminPerms.length) {
      for (const p of adminPerms) keys.add(p);
    }
  }
  return [...keys];
}

export function hasResolvedPermission(resolvedSet, key) {
  return resolvedSet instanceof Set ? resolvedSet.has(key) : false;
}

/** ¿Algún permiso admin? → profiles.role debe ser admin (RLS). */
export function resolvedImpliesAdminRole(resolvedSet) {
  for (const key of ADMIN_PERMISSION_KEYS) {
    if (resolvedSet.has(key)) return true;
  }
  return false;
}

/**
 * Sync legacy user_permissions allowlist from resolved set.
 * Vacío = todas las sales features on (compat hasUserFeature).
 */
export function legacyUserPermissionsFromResolved(resolvedSet) {
  const sales = ["sales:view_modal", "sales:view_detail", "sales:history"];
  const enabled = sales.filter((k) => resolvedSet.has(k));
  if (enabled.length === sales.length) return [];
  return enabled;
}

export function legacyAdminPermissionsFromResolved(resolvedSet) {
  const elevated = new Set([
    "gestionar_roles_permisos",
    "ver_logs",
    "ver_metricas_financieras_usuarios",
  ]);
  const delegable = ADMIN_PERMISSION_KEYS.filter((k) => !elevated.has(k));
  return delegable.filter((k) => resolvedSet.has(k));
}

/** Convert UI allowlist of overridable features → deny overrides for missing ones. */
export function overridesFromFeatureAllowlist(enabledKeys) {
  const enabled = new Set(enabledKeys || []);
  return OVERRIDABLE_APP_FEATURES.map((clave) => ({
    clave,
    otorgado: enabled.has(clave),
  }));
}

export function featureAllowlistFromResolved(resolvedSet) {
  return OVERRIDABLE_APP_FEATURES.filter((k) => resolvedSet.has(k));
}
