const DELEGATABLE_ADMIN_PERMISSIONS = [
  { key: "dashboard:read", label: "Ver resumen del panel" },
  { key: "users:read", label: "Ver lista de usuarios" },
  { key: "users:deactivate", label: "Desactivar cuentas" },
  { key: "users:activate", label: "Activar cuentas" },
  { key: "users:export", label: "Exportar usuarios (CSV)" },
  { key: "goals:read", label: "Ver metas globales" },
  { key: "tools:analytics", label: "Ver uso de herramientas (agregado)" },
  { key: "support:read", label: "Ver tickets de Atención a usuario (legacy)" },
  { key: "ver_tickets_soporte", label: "Ver tickets de soporte" },
  { key: "responder_tickets_soporte", label: "Responder tickets de soporte" },
];
const SUPER_ADMIN_ONLY_PERMISSIONS = ["users:role", "users:permissions", "admin:roles", "ver_logs_administracion"];
const DELEGATABLE_KEYS = new Set(DELEGATABLE_ADMIN_PERMISSIONS.map((p) => p.key));
const LEGACY_PERMISSION_MAP = {
  "worksheets:read": "tools:analytics",
  "sales:read": null,
  "sales:export": null,
  "agenda:read": null,
  "prospects:read": null,
  "activity:read": null,
  "support:read": "ver_tickets_soporte",
};

/** Aliases: pedir A también acepta B en admin_permissions. */
const PERMISSION_ALIASES = {
  ver_tickets_soporte: ["support:read"],
  "support:read": ["ver_tickets_soporte"],
  responder_tickets_soporte: ["support:read"],
};

function isSuperAdmin(profile) {
  return profile.role === "admin" && profile.is_super_admin === true;
}

function permissionGranted(profile, perm) {
  const list = profile.admin_permissions || [];
  if (list.includes(perm)) return true;
  const aliases = PERMISSION_ALIASES[perm] || [];
  return aliases.some((a) => list.includes(a));
}

function hasPermission(profile, perm) {
  if (profile.role !== "admin") return false;
  if (isSuperAdmin(profile)) return true;
  if (SUPER_ADMIN_ONLY_PERMISSIONS.includes(perm)) {
    // Solo Superadmin por defecto; si está en array (override explícito raro), permitir
    return permissionGranted(profile, perm);
  }
  return permissionGranted(profile, perm);
}

function hasAnyAdminAccess(profile) {
  if (profile.role !== "admin") return false;
  if (isSuperAdmin(profile)) return true;
  return (profile.admin_permissions || []).some((p) => DELEGATABLE_KEYS.has(p));
}

function effectivePermissions(profile) {
  if (!hasAnyAdminAccess(profile)) return [];
  if (isSuperAdmin(profile)) {
    return [
      ...DELEGATABLE_ADMIN_PERMISSIONS.map((p) => p.key),
      ...SUPER_ADMIN_ONLY_PERMISSIONS,
    ];
  }
  const out = new Set(
    (profile.admin_permissions || []).filter((p) => DELEGATABLE_KEYS.has(p) || SUPER_ADMIN_ONLY_PERMISSIONS.includes(p)),
  );
  // Expandir legacy support:read
  if (out.has("support:read")) {
    out.add("ver_tickets_soporte");
    out.add("responder_tickets_soporte");
  }
  return [...out];
}

function permissionLabel(key) {
  return DELEGATABLE_ADMIN_PERMISSIONS.find((p) => p.key === key)?.label ?? key;
}

const ADMIN_NAV_PERMISSIONS = {
  "/admin": "dashboard:read",
  "/admin/users": "users:read",
  "/admin/goals": "goals:read",
  "/admin/tools": "tools:analytics",
  "/admin/support": "ver_tickets_soporte",
  "/admin/roles": "admin:roles",
  "/admin/logs": "ver_logs_administracion",
};

function canAccessAdminPath(profile, pathname) {
  if (!hasAnyAdminAccess(profile)) return false;
  if (pathname.startsWith("/admin/users/") && pathname.includes("/permissions")) {
    return hasPermission(profile, "users:permissions");
  }
  if (pathname.startsWith("/admin/export/users")) return hasPermission(profile, "users:export");
  if (pathname.startsWith("/admin/export/logs")) return hasPermission(profile, "ver_logs_administracion");
  if (pathname.startsWith("/admin/users")) return hasPermission(profile, "users:read");
  if (pathname.startsWith("/admin/tools")) return hasPermission(profile, "tools:analytics");
  if (pathname.startsWith("/admin/support")) return hasPermission(profile, "ver_tickets_soporte");
  if (pathname.startsWith("/admin/goals")) return hasPermission(profile, "goals:read");
  if (pathname.startsWith("/admin/roles")) return hasPermission(profile, "admin:roles");
  if (pathname.startsWith("/admin/logs")) return hasPermission(profile, "ver_logs_administracion");
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
