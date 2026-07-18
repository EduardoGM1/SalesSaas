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
] as const;

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
  if (!hasAnyAdminAccess(profile)) return [];
  if (isSuperAdmin(profile)) {
    return [
      ...DELEGATABLE_ADMIN_PERMISSIONS.map((p) => p.key),
      ...SUPER_ADMIN_ONLY_PERMISSIONS,
    ];
  }
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

export function canAccessAdminPath(profile: AdminAccessProfile, pathname: string): boolean {
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
