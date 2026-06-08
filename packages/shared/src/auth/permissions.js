const DELEGATABLE_ADMIN_PERMISSIONS = [
  { key: "dashboard:read", label: "Ver resumen del panel" },
  { key: "users:read", label: "Ver lista de usuarios" },
  { key: "users:deactivate", label: "Desactivar cuentas" },
  { key: "users:activate", label: "Activar cuentas" },
  { key: "users:export", label: "Exportar usuarios (CSV)" },
  { key: "sales:read", label: "Ver ventas globales" },
  { key: "sales:export", label: "Exportar ventas (CSV)" },
  { key: "agenda:read", label: "Ver agenda global" },
  { key: "goals:read", label: "Ver metas globales" },
  { key: "activity:read", label: "Ver actividad global" },
  { key: "worksheets:read", label: "Ver worksheets" }
];
const SUPER_ADMIN_ONLY_PERMISSIONS = ["users:role", "users:permissions"];
const DELEGATABLE_KEYS = new Set(DELEGATABLE_ADMIN_PERMISSIONS.map((p) => p.key));
function isSuperAdmin(profile) {
  return profile.role === "admin" && profile.is_super_admin === true;
}
function hasPermission(profile, perm) {
  if (profile.role !== "admin") return false;
  if (isSuperAdmin(profile)) return true;
  if (SUPER_ADMIN_ONLY_PERMISSIONS.includes(perm)) {
    return false;
  }
  return profile.admin_permissions.includes(perm);
}
function hasAnyAdminAccess(profile) {
  if (profile.role !== "admin") return false;
  if (isSuperAdmin(profile)) return true;
  return profile.admin_permissions.some((p) => DELEGATABLE_KEYS.has(p));
}
function effectivePermissions(profile) {
  if (!hasAnyAdminAccess(profile)) return [];
  if (isSuperAdmin(profile)) {
    return [
      ...DELEGATABLE_ADMIN_PERMISSIONS.map((p) => p.key),
      ...SUPER_ADMIN_ONLY_PERMISSIONS
    ];
  }
  return profile.admin_permissions.filter((p) => DELEGATABLE_KEYS.has(p));
}
function permissionLabel(key) {
  return DELEGATABLE_ADMIN_PERMISSIONS.find((p) => p.key === key)?.label ?? key;
}
const ADMIN_NAV_PERMISSIONS = {
  "/admin": "dashboard:read",
  "/admin/users": "users:read",
  "/admin/sales": "sales:read",
  "/admin/agenda": "agenda:read",
  "/admin/goals": "goals:read",
  "/admin/activity": "activity:read",
  "/admin/worksheets": "worksheets:read"
};
function canAccessAdminPath(profile, pathname) {
  if (!hasAnyAdminAccess(profile)) return false;
  if (pathname.startsWith("/admin/users/") && pathname.includes("/permissions")) {
    return hasPermission(profile, "users:permissions");
  }
  if (pathname.startsWith("/admin/export/users")) return hasPermission(profile, "users:export");
  if (pathname.startsWith("/admin/export/sales")) return hasPermission(profile, "sales:export");
  if (pathname.startsWith("/admin/users")) return hasPermission(profile, "users:read");
  if (pathname.startsWith("/admin/worksheets")) return hasPermission(profile, "worksheets:read");
  if (pathname.startsWith("/admin/activity")) return hasPermission(profile, "activity:read");
  if (pathname.startsWith("/admin/goals")) return hasPermission(profile, "goals:read");
  if (pathname.startsWith("/admin/agenda")) return hasPermission(profile, "agenda:read");
  if (pathname.startsWith("/admin/sales")) return hasPermission(profile, "sales:read");
  if (pathname === "/admin") return hasPermission(profile, "dashboard:read");
  return isSuperAdmin(profile);
}
function sanitizeDelegatedPermissions(perms) {
  return perms.filter((p) => DELEGATABLE_KEYS.has(p));
}
export {
  ADMIN_NAV_PERMISSIONS,
  DELEGATABLE_ADMIN_PERMISSIONS,
  SUPER_ADMIN_ONLY_PERMISSIONS,
  canAccessAdminPath,
  effectivePermissions,
  hasAnyAdminAccess,
  hasPermission,
  isSuperAdmin,
  permissionLabel,
  sanitizeDelegatedPermissions
};
