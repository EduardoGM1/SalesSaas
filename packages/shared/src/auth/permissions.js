const DELEGATABLE_ADMIN_PERMISSIONS = [
  { key: "dashboard:read", label: "Ver resumen del panel" },
  { key: "users:read", label: "Ver lista de usuarios" },
  { key: "users:deactivate", label: "Desactivar cuentas" },
  { key: "users:activate", label: "Activar cuentas" },
  { key: "users:export", label: "Exportar usuarios (CSV)" },
  { key: "goals:read", label: "Ver metas globales" },
  { key: "tools:analytics", label: "Ver uso de herramientas (agregado)" },
  { key: "support:read", label: "Ver tickets de Atención a usuario" }
];
const SUPER_ADMIN_ONLY_PERMISSIONS = ["users:role", "users:permissions"];
const DELEGATABLE_KEYS = new Set(DELEGATABLE_ADMIN_PERMISSIONS.map((p) => p.key));
const LEGACY_PERMISSION_MAP = {
  "worksheets:read": "tools:analytics",
  "sales:read": null,
  "sales:export": null,
  "agenda:read": null,
  "prospects:read": null,
  "activity:read": null
};
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
  "/admin/goals": "goals:read",
  "/admin/tools": "tools:analytics",
  "/admin/support": "support:read"
};
function canAccessAdminPath(profile, pathname) {
  if (!hasAnyAdminAccess(profile)) return false;
  if (pathname.startsWith("/admin/users/") && pathname.includes("/permissions")) {
    return hasPermission(profile, "users:permissions");
  }
  if (pathname.startsWith("/admin/export/users")) return hasPermission(profile, "users:export");
  if (pathname.startsWith("/admin/users")) return hasPermission(profile, "users:read");
  if (pathname.startsWith("/admin/tools")) return hasPermission(profile, "tools:analytics");
  if (pathname.startsWith("/admin/support")) return hasPermission(profile, "support:read");
  if (pathname.startsWith("/admin/goals")) return hasPermission(profile, "goals:read");
  if (pathname === "/admin") return hasPermission(profile, "dashboard:read");
  return isSuperAdmin(profile);
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
      if (mapped) out.add(mapped);
    }
  }
  return [...out];
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
