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
] as const;

export type DelegatablePermission = (typeof DELEGATABLE_ADMIN_PERMISSIONS)[number]["key"];

export const SUPER_ADMIN_ONLY_PERMISSIONS = ["users:role", "users:permissions"] as const;

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
};

export function isSuperAdmin(profile: AdminAccessProfile): boolean {
  return profile.role === "admin" && profile.is_super_admin === true;
}

export function hasPermission(profile: AdminAccessProfile, perm: string): boolean {
  if (profile.role !== "admin") return false;
  if (isSuperAdmin(profile)) return true;
  if (SUPER_ADMIN_ONLY_PERMISSIONS.includes(perm as (typeof SUPER_ADMIN_ONLY_PERMISSIONS)[number])) {
    return false;
  }
  return profile.admin_permissions.includes(perm);
}

/** ¿Puede entrar al panel admin? */
export function hasAnyAdminAccess(profile: AdminAccessProfile): boolean {
  if (profile.role !== "admin") return false;
  if (isSuperAdmin(profile)) return true;
  return profile.admin_permissions.some((p) => DELEGATABLE_KEYS.has(p));
}

export function effectivePermissions(profile: AdminAccessProfile): string[] {
  if (!hasAnyAdminAccess(profile)) return [];
  if (isSuperAdmin(profile)) {
    return [
      ...DELEGATABLE_ADMIN_PERMISSIONS.map((p) => p.key),
      ...SUPER_ADMIN_ONLY_PERMISSIONS,
    ];
  }
  return profile.admin_permissions.filter((p) => DELEGATABLE_KEYS.has(p));
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
  "/admin/support": "support:read",
};

export function canAccessAdminPath(profile: AdminAccessProfile, pathname: string): boolean {
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
