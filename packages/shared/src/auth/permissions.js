/**
 * Permisos admin del panel (secciones consolidadas).
 * Grupos de equivalencia: claves nuevas ↔ legacy para migración / RLS / cookies viejas.
 */

const DELEGATABLE_ADMIN_PERMISSIONS = [
  { key: "ver_resumen", label: "Ver Resumen" },
  { key: "gestionar_usuarios", label: "Gestionar Usuarios" },
  { key: "gestionar_metas", label: "Gestionar Metas" },
  { key: "ver_metricas", label: "Ver Métricas" },
  { key: "gestionar_soporte", label: "Gestionar Soporte" },
];

const SUPER_ADMIN_ONLY_PERMISSIONS = [
  "ver_logs",
  "gestionar_roles_permisos",
  "ver_metricas_financieras_usuarios",
];

const USER_FINANCIAL_METRICS_PERMISSION = "ver_metricas_financieras_usuarios";

/** Grupos: tener cualquiera implica todas (compat legacy ↔ consolidado). */
const PERMISSION_EQUIVALENCE_GROUPS = [
  ["ver_resumen", "dashboard:read"],
  [
    "gestionar_usuarios",
    "users:read",
    "users:deactivate",
    "users:activate",
    "users:export",
    "users:role",
    "users:permissions",
  ],
  ["ver_logs", "ver_logs_administracion"],
  ["gestionar_metas", "goals:read"],
  ["ver_metricas", "tools:analytics", "worksheets:read"],
  [
    "gestionar_soporte",
    "ver_tickets_soporte",
    "responder_tickets_soporte",
    "support:read",
  ],
  ["gestionar_roles_permisos", "admin:roles"],
];

const KEY_TO_GROUP = new Map();
for (const group of PERMISSION_EQUIVALENCE_GROUPS) {
  for (const key of group) KEY_TO_GROUP.set(key, group);
}

function canViewUserFinancialMetrics({ isSuperAdmin = false, permissions = [] } = {}) {
  if (isSuperAdmin) return true;
  return expandAdminPermissionSet(permissions).has(USER_FINANCIAL_METRICS_PERMISSION);
}

const DELEGATABLE_KEYS = new Set(DELEGATABLE_ADMIN_PERMISSIONS.map((p) => p.key));
const ALL_KNOWN_ADMIN_KEYS = new Set([
  ...DELEGATABLE_KEYS,
  ...SUPER_ADMIN_ONLY_PERMISSIONS,
  ...PERMISSION_EQUIVALENCE_GROUPS.flat(),
]);

const LEGACY_PERMISSION_MAP = {
  "worksheets:read": "ver_metricas",
  "sales:read": null,
  "sales:export": null,
  "agenda:read": null,
  "prospects:read": null,
  "activity:read": null,
  "support:read": "gestionar_soporte",
  "dashboard:read": "ver_resumen",
  "users:read": "gestionar_usuarios",
  "users:deactivate": "gestionar_usuarios",
  "users:activate": "gestionar_usuarios",
  "users:export": "gestionar_usuarios",
  "users:role": "gestionar_usuarios",
  "users:permissions": "gestionar_usuarios",
  "goals:read": "gestionar_metas",
  "tools:analytics": "ver_metricas",
  ver_tickets_soporte: "gestionar_soporte",
  responder_tickets_soporte: "gestionar_soporte",
  ver_logs_administracion: "ver_logs",
  "admin:roles": "gestionar_roles_permisos",
};

function isSuperAdmin(profile) {
  return profile.role === "admin" && profile.is_super_admin === true;
}

function expandAdminPermissionSet(permissions) {
  const set = new Set();
  for (const raw of permissions || []) {
    const key = String(raw || "");
    if (!key) continue;
    set.add(key);
    const group = KEY_TO_GROUP.get(key);
    if (group) {
      for (const k of group) set.add(k);
    }
  }
  return set;
}

function adminPermissionSetHas(set, perm) {
  if (set.has(perm)) return true;
  const group = KEY_TO_GROUP.get(perm);
  if (!group) return false;
  return group.some((k) => set.has(k));
}

function resolvedAdminKeys(profile) {
  if (Array.isArray(profile?.permission_keys) && profile.permission_keys.length) {
    return profile.permission_keys;
  }
  return profile?.admin_permissions || [];
}

function permissionGranted(profile, perm) {
  const set = expandAdminPermissionSet(resolvedAdminKeys(profile));
  return adminPermissionSetHas(set, perm);
}

function hasPermission(profile, perm) {
  if (profile.role !== "admin") return false;
  if (isSuperAdmin(profile)) return true;
  return permissionGranted(profile, perm);
}

function hasAnyAdminAccess(profile) {
  if (profile.role !== "admin") return false;
  if (isSuperAdmin(profile)) return true;
  const set = expandAdminPermissionSet(resolvedAdminKeys(profile));
  return [...set].some((p) => ALL_KNOWN_ADMIN_KEYS.has(p));
}

function effectivePermissions(profile) {
  if (profile?.role !== "admin") return [];
  if (isSuperAdmin(profile)) {
    return [
      ...DELEGATABLE_ADMIN_PERMISSIONS.map((p) => p.key),
      ...SUPER_ADMIN_ONLY_PERMISSIONS,
    ];
  }
  const expanded = expandAdminPermissionSet(resolvedAdminKeys(profile));
  const out = new Set();
  for (const p of DELEGATABLE_ADMIN_PERMISSIONS) {
    if (adminPermissionSetHas(expanded, p.key)) out.add(p.key);
  }
  for (const p of SUPER_ADMIN_ONLY_PERMISSIONS) {
    if (adminPermissionSetHas(expanded, p)) out.add(p);
  }
  return [...out];
}

function permissionLabel(key) {
  return DELEGATABLE_ADMIN_PERMISSIONS.find((p) => p.key === key)?.label ?? key;
}

const ADMIN_NAV_PERMISSIONS = {
  "/admin": "ver_resumen",
  "/admin/users": "gestionar_usuarios",
  "/admin/groups": "gestionar_usuarios",
  "/admin/modules": "gestionar_roles_permisos",
  "/admin/goals": "gestionar_metas",
  "/admin/tools": "ver_metricas",
  "/admin/support": "gestionar_soporte",
  "/admin/roles": "gestionar_roles_permisos",
  "/admin/logs": "ver_logs",
};

function hasAnyAdminNavPermission(permissions) {
  const set = expandAdminPermissionSet(permissions);
  return Object.values(ADMIN_NAV_PERMISSIONS).some((perm) => adminPermissionSetHas(set, perm));
}

function canAccessAdminPath(profile, pathname) {
  if (!hasAnyAdminAccess(profile)) return false;
  if (isSuperAdmin(profile)) return true;
  if (pathname.startsWith("/admin/users/") && pathname.includes("/permissions")) {
    return hasPermission(profile, "gestionar_usuarios");
  }
  if (pathname.startsWith("/admin/export/users")) return hasPermission(profile, "gestionar_usuarios");
  if (pathname.startsWith("/admin/export/logs")) return hasPermission(profile, "ver_logs");
  if (pathname.startsWith("/admin/users")) return hasPermission(profile, "gestionar_usuarios");
  if (pathname.startsWith("/admin/groups")) return hasPermission(profile, "gestionar_usuarios");
  if (pathname.startsWith("/admin/modules")) return hasPermission(profile, "gestionar_roles_permisos");
  if (pathname.startsWith("/admin/tools")) return hasPermission(profile, "ver_metricas");
  if (pathname.startsWith("/admin/support")) return hasPermission(profile, "gestionar_soporte");
  if (pathname.startsWith("/admin/goals")) return hasPermission(profile, "gestionar_metas");
  if (pathname.startsWith("/admin/roles")) return hasPermission(profile, "gestionar_roles_permisos");
  if (pathname.startsWith("/admin/logs")) return hasPermission(profile, "ver_logs");
  if (pathname === "/admin") return hasPermission(profile, "ver_resumen");
  return false;
}

function sanitizeDelegatedPermissions(perms) {
  const out = new Set();
  for (const raw of perms) {
    if (DELEGATABLE_KEYS.has(raw)) {
      out.add(raw);
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(LEGACY_PERMISSION_MAP, raw)) {
      const mapped = LEGACY_PERMISSION_MAP[raw];
      if (mapped && DELEGATABLE_KEYS.has(mapped)) out.add(mapped);
    }
  }
  return [...out];
}

export {
  ADMIN_NAV_PERMISSIONS,
  DELEGATABLE_ADMIN_PERMISSIONS,
  PERMISSION_EQUIVALENCE_GROUPS,
  SUPER_ADMIN_ONLY_PERMISSIONS,
  USER_FINANCIAL_METRICS_PERMISSION,
  adminPermissionSetHas,
  canAccessAdminPath,
  canViewUserFinancialMetrics,
  effectivePermissions,
  expandAdminPermissionSet,
  hasAnyAdminAccess,
  hasAnyAdminNavPermission,
  hasPermission,
  isSuperAdmin,
  permissionLabel,
  sanitizeDelegatedPermissions,
};
