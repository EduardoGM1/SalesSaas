import { translate } from "@/lib/i18n.js";

/** Permisos delegables a admins (no incluye users:role ni users:permissions). */
export const DELEGATABLE_ADMIN_PERMISSIONS = [
  { key: "dashboard:read", labelKey: "admin.perm.dashboardRead" },
  { key: "users:read", labelKey: "admin.perm.usersRead" },
  { key: "users:deactivate", labelKey: "admin.perm.usersDeactivate" },
  { key: "users:activate", labelKey: "admin.perm.usersActivate" },
  { key: "users:export", labelKey: "admin.perm.usersExport" },
  { key: "goals:read", labelKey: "admin.perm.goalsRead" },
  { key: "tools:analytics", labelKey: "admin.perm.toolsAnalytics" },
  { key: "support:read", labelKey: "admin.perm.supportRead" },
  { key: "ver_tickets_soporte", labelKey: "admin.perm.verTicketsSoporte" },
  { key: "responder_tickets_soporte", labelKey: "admin.perm.responderTicketsSoporte" },
] as const;

export type DelegatablePermission = (typeof DELEGATABLE_ADMIN_PERMISSIONS)[number]["key"];

export const SUPER_ADMIN_ONLY_PERMISSIONS = [
  "users:role",
  "users:permissions",
  "admin:roles",
  "ver_logs_administracion",
  "ver_metricas_financieras_usuarios",
] as const;

/** Métricas por usuario (Expedientes/Ventas/Volumen). El badge Principal usa isSuperAdmin del viewer. */
export const USER_FINANCIAL_METRICS_PERMISSION = "ver_metricas_financieras_usuarios";

export function canViewUserFinancialMetrics(opts: {
  isSuperAdmin?: boolean;
  permissions?: string[] | null;
}): boolean {
  if (opts.isSuperAdmin) return true;
  const list = opts.permissions || [];
  return list.includes(USER_FINANCIAL_METRICS_PERMISSION);
}

export type AdminPermission = DelegatablePermission | (typeof SUPER_ADMIN_ONLY_PERMISSIONS)[number];

export interface AdminAccessProfile {
  id: string;
  role: string;
  is_super_admin: boolean;
  admin_permissions: string[];
}

const DELEGATABLE_KEYS = new Set<string>(DELEGATABLE_ADMIN_PERMISSIONS.map((p) => p.key));

/** Permisos CRM antiguos → se eliminan o mapean al migrar. */
const LEGACY_PERMISSION_MAP: Record<string, DelegatablePermission | null> = {
  "worksheets:read": "tools:analytics",
  "sales:read": null,
  "sales:export": null,
  "agenda:read": null,
  "prospects:read": null,
  "activity:read": null,
  "support:read": "ver_tickets_soporte",
};

const PERMISSION_ALIASES: Record<string, string[]> = {
  ver_tickets_soporte: ["support:read"],
  "support:read": ["ver_tickets_soporte"],
  responder_tickets_soporte: ["support:read"],
};

export function isSuperAdmin(profile: AdminAccessProfile): boolean {
  return profile.role === "admin" && profile.is_super_admin === true;
}

function permissionGranted(profile: AdminAccessProfile, perm: string): boolean {
  const list = profile.admin_permissions || [];
  if (list.includes(perm)) return true;
  return (PERMISSION_ALIASES[perm] || []).some((a) => list.includes(a));
}

export function hasPermission(profile: AdminAccessProfile, perm: string): boolean {
  if (profile.role !== "admin") return false;
  if (isSuperAdmin(profile)) return true;
  return permissionGranted(profile, perm);
}

/** ¿Puede entrar al panel admin? */
export function hasAnyAdminAccess(profile: AdminAccessProfile): boolean {
  if (profile.role !== "admin") return false;
  if (isSuperAdmin(profile)) return true;
  return (profile.admin_permissions || []).some((p) => DELEGATABLE_KEYS.has(p));
}

export function effectivePermissions(profile: AdminAccessProfile): string[] {
  if (profile?.role !== "admin") return [];
  if (isSuperAdmin(profile)) {
    return [
      ...DELEGATABLE_ADMIN_PERMISSIONS.map((p) => p.key),
      ...SUPER_ADMIN_ONLY_PERMISSIONS,
    ];
  }
  // Roles nuevos pueden vivir solo en permission_keys; no cortar por admin_permissions vacío.
  const out = new Set(
    (profile.admin_permissions || []).filter(
      (p) => DELEGATABLE_KEYS.has(p) || (SUPER_ADMIN_ONLY_PERMISSIONS as readonly string[]).includes(p),
    ),
  );
  if (out.has("support:read")) {
    out.add("ver_tickets_soporte");
    out.add("responder_tickets_soporte");
  }
  return [...out];
}

export function permissionLabel(key: string): string {
  const perm = DELEGATABLE_ADMIN_PERMISSIONS.find((p) => p.key === key);
  return perm ? translate(perm.labelKey) : key;
}

/** Pestañas del panel → permiso requerido */
export const ADMIN_NAV_PERMISSIONS: Record<string, AdminPermission> = {
  "/admin": "dashboard:read",
  "/admin/users": "users:read",
  "/admin/goals": "goals:read",
  "/admin/tools": "tools:analytics",
  "/admin/support": "ver_tickets_soporte",
  "/admin/roles": "admin:roles",
  "/admin/logs": "ver_logs_administracion",
};

/** Orden de pestañas del panel (fallback = primera permitida). */
export const ADMIN_NAV_ORDER = [
  "/admin",
  "/admin/users",
  "/admin/roles",
  "/admin/logs",
  "/admin/goals",
  "/admin/tools",
  "/admin/support",
] as const;

/** Expande aliases (p. ej. support:read ↔ ver_tickets_soporte). */
export function expandAdminPermissionSet(permissions: string[] | null | undefined): Set<string> {
  const set = new Set<string>();
  for (const raw of permissions || []) {
    const key = String(raw || "");
    if (!key) continue;
    set.add(key);
    for (const alias of PERMISSION_ALIASES[key] || []) set.add(alias);
  }
  return set;
}

export function adminPermissionSetHas(set: Set<string>, perm: string): boolean {
  if (set.has(perm)) return true;
  return (PERMISSION_ALIASES[perm] || []).some((a) => set.has(a));
}

/** ¿La lista de keys (sesión admin) da acceso a alguna pestaña del panel? */
export function hasAnyAdminNavPermission(permissions: string[] | null | undefined): boolean {
  const set = expandAdminPermissionSet(permissions);
  return Object.values(ADMIN_NAV_PERMISSIONS).some((perm) => adminPermissionSetHas(set, perm));
}

export function getFirstAllowedAdminPath(
  permissions: string[] | null | undefined,
  isSuper = false,
): string | null {
  if (isSuper) return "/admin";
  const set = expandAdminPermissionSet(permissions);
  for (const href of ADMIN_NAV_ORDER) {
    const perm = ADMIN_NAV_PERMISSIONS[href];
    if (perm && adminPermissionSetHas(set, perm)) return href;
  }
  return null;
}

/**
 * Gate de ruta usando la misma fuente que las tabs (`session.permissions`),
 * no `profile.admin_permissions` (legacy) — evita loops Navigate por drift.
 */
export function canAccessAdminPathByPermissions(
  permissions: string[] | null | undefined,
  pathname: string,
  isSuper = false,
): boolean {
  if (isSuper) return true;
  const set = expandAdminPermissionSet(permissions);
  if (pathname.startsWith("/admin/users/") && pathname.includes("/permissions")) {
    return adminPermissionSetHas(set, "users:permissions");
  }
  if (pathname.startsWith("/admin/export/users")) return adminPermissionSetHas(set, "users:export");
  if (pathname.startsWith("/admin/export/logs")) return adminPermissionSetHas(set, "ver_logs_administracion");
  if (pathname.startsWith("/admin/users")) return adminPermissionSetHas(set, "users:read");
  if (pathname.startsWith("/admin/tools")) return adminPermissionSetHas(set, "tools:analytics");
  if (pathname.startsWith("/admin/support")) return adminPermissionSetHas(set, "ver_tickets_soporte");
  if (pathname.startsWith("/admin/goals")) return adminPermissionSetHas(set, "goals:read");
  if (pathname.startsWith("/admin/roles")) return adminPermissionSetHas(set, "admin:roles");
  if (pathname.startsWith("/admin/logs")) return adminPermissionSetHas(set, "ver_logs_administracion");
  if (pathname === "/admin") return adminPermissionSetHas(set, "dashboard:read");
  return false;
}

export function canAccessAdminPath(profile: AdminAccessProfile, pathname: string): boolean {
  if (!hasAnyAdminAccess(profile)) return false;
  if (isSuperAdmin(profile)) return true;
  return canAccessAdminPathByPermissions(profile.admin_permissions || [], pathname, false);
}

export function sanitizeDelegatedPermissions(perms: string[]): DelegatablePermission[] {
  const out = new Set<DelegatablePermission>();
  for (const raw of perms) {
    if (DELEGATABLE_KEYS.has(raw)) {
      out.add(raw as DelegatablePermission);
      continue;
    }
    if (raw in LEGACY_PERMISSION_MAP) {
      const mapped = LEGACY_PERMISSION_MAP[raw];
      if (mapped) out.add(mapped);
    }
  }
  return [...out];
}
