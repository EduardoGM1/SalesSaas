import {
  ALL_PERMISSION_KEYS,
  ADMIN_PERMISSION_KEYS,
  OVERRIDABLE_APP_FEATURES,
  VENDEDOR_DEFAULT_PERMISSIONS,
} from "./permission-catalog.js";

/**
 * Resuelve permisos efectivos (modelo aditivo):
 * efectivo = permisos(rol) ∪ overrides(otorgado=true) ∪ admin_permissions (legacy/delegación)
 *
 * Los overrides NUNCA restan. Para quitar acceso: cambiar rol o suspender.
 * Superadmin → todos.
 *
 * @param {{
 *   is_super_admin?: boolean,
 *   role?: string,
 *   role_permission_keys?: string[],
 *   overrides?: { clave: string, otorgado?: boolean }[],
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
    // Solo aditivo: ignorar otorgado=false (deny deprecado).
    if (ov.otorgado === true) granted.add(key);
  }

  // Delegación admin (profiles.admin_permissions): suma sobre el rol.
  if (input.role === "admin") {
    for (const p of input.admin_permissions || []) {
      const key = String(p || "").trim();
      if (key) granted.add(key);
    }
  }

  // Compat legacy: user_permissions solo puede SUMAR features, nunca restar del rol.
  const userPerms = Array.isArray(input.user_permissions) ? input.user_permissions : null;
  if (userPerms && userPerms.length > 0) {
    for (const feat of ["sales:view_modal", "sales:view_detail", "sales:history"]) {
      if (userPerms.includes(feat)) granted.add(feat);
    }
  }

  return granted;
}

function inferRoleKeysFromLegacy(input) {
  const keys = new Set(VENDEDOR_DEFAULT_PERMISSIONS);
  if (input.role === "admin") {
    const adminPerms = Array.isArray(input.admin_permissions) ? input.admin_permissions : [];
    for (const p of adminPerms) keys.add(p);
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

/**
 * Allowlist de features → overrides SOLO aditivos (otorgado:true).
 * No genera denies. Las features del rol se mantienen aunque no estén en la lista.
 */
export function overridesFromFeatureAllowlist(enabledKeys) {
  const enabled = new Set(enabledKeys || []);
  return OVERRIDABLE_APP_FEATURES
    .filter((clave) => enabled.has(clave))
    .map((clave) => ({ clave, otorgado: true }));
}

export function featureAllowlistFromResolved(resolvedSet) {
  return OVERRIDABLE_APP_FEATURES.filter((k) => resolvedSet.has(k));
}
