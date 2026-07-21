import { translate } from "@/lib/i18n.js";

/** Permisos admin delegables (secciones del panel, sin logs/roles/métricas financieras). */
export const DELEGATABLE_ADMIN_PERMISSIONS = [
  { key: "ver_resumen", labelKey: "admin.perm.verResumen" },
  { key: "gestionar_usuarios", labelKey: "admin.perm.gestionarUsuarios" },
  { key: "gestionar_metas", labelKey: "admin.perm.gestionarMetas" },
  { key: "ver_metricas", labelKey: "admin.perm.verMetricas" },
  { key: "gestionar_soporte", labelKey: "admin.perm.gestionarSoporte" },
] as const;

export type DelegatablePermission = (typeof DELEGATABLE_ADMIN_PERMISSIONS)[number]["key"];

export const SUPER_ADMIN_ONLY_PERMISSIONS = [
  "ver_logs",
  "gestionar_roles_permisos",
  "ver_metricas_financieras_usuarios",
] as const;

/** Métricas por usuario (Expedientes/Ventas/Volumen). El badge Principal usa isSuperAdmin del viewer. */
export const USER_FINANCIAL_METRICS_PERMISSION = "ver_metricas_financieras_usuarios";

const PERMISSION_EQUIVALENCE_GROUPS: readonly (readonly string[])[] = [
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

const KEY_TO_GROUP = new Map<string, readonly string[]>();
for (const group of PERMISSION_EQUIVALENCE_GROUPS) {
  for (const key of group) KEY_TO_GROUP.set(key, group);
}

export function canViewUserFinancialMetrics(opts: {
  isSuperAdmin?: boolean;
  permissions?: string[] | null;
}): boolean {
  if (opts.isSuperAdmin) return true;
  return expandAdminPermissionSet(opts.permissions).has(USER_FINANCIAL_METRICS_PERMISSION);
}

export type AdminPermission = DelegatablePermission | (typeof SUPER_ADMIN_ONLY_PERMISSIONS)[number];

export interface AdminAccessProfile {
  id: string;
  role: string;
  is_super_admin: boolean;
  admin_permissions: string[];
  permission_keys?: string[];
}

const DELEGATABLE_KEYS = new Set<string>(DELEGATABLE_ADMIN_PERMISSIONS.map((p) => p.key));
const ALL_KNOWN_ADMIN_KEYS = new Set<string>([
  ...DELEGATABLE_KEYS,
  ...(SUPER_ADMIN_ONLY_PERMISSIONS as readonly string[]),
  ...PERMISSION_EQUIVALENCE_GROUPS.flat(),
]);

const LEGACY_PERMISSION_MAP: Record<string, DelegatablePermission | null> = {
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
};

export function isSuperAdmin(profile: AdminAccessProfile): boolean {
  return profile.role === "admin" && profile.is_super_admin === true;
}

export function expandAdminPermissionSet(permissions: string[] | null | undefined): Set<string> {
  const set = new Set<string>();
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

export function adminPermissionSetHas(set: Set<string>, perm: string): boolean {
  if (set.has(perm)) return true;
  const group = KEY_TO_GROUP.get(perm);
  if (!group) return false;
  return group.some((k) => set.has(k));
}

function resolvedAdminKeys(profile: AdminAccessProfile): string[] {
  if (Array.isArray(profile.permission_keys) && profile.permission_keys.length) {
    return profile.permission_keys;
  }
  return profile.admin_permissions || [];
}

function permissionGranted(profile: AdminAccessProfile, perm: string): boolean {
  const set = expandAdminPermissionSet(resolvedAdminKeys(profile));
  return adminPermissionSetHas(set, perm);
}

export function hasPermission(profile: AdminAccessProfile, perm: string): boolean {
  if (profile.role !== "admin") return false;
  if (isSuperAdmin(profile)) return true;
  return permissionGranted(profile, perm);
}

export function hasAnyAdminAccess(profile: AdminAccessProfile): boolean {
  if (profile.role !== "admin") return false;
  if (isSuperAdmin(profile)) return true;
  const set = expandAdminPermissionSet(resolvedAdminKeys(profile));
  return [...set].some((p) => ALL_KNOWN_ADMIN_KEYS.has(p));
}

export function effectivePermissions(profile: AdminAccessProfile): string[] {
  if (profile?.role !== "admin") return [];
  if (isSuperAdmin(profile)) {
    return [
      ...DELEGATABLE_ADMIN_PERMISSIONS.map((p) => p.key),
      ...SUPER_ADMIN_ONLY_PERMISSIONS,
    ];
  }
  const expanded = expandAdminPermissionSet(resolvedAdminKeys(profile));
  const out = new Set<string>();
  for (const p of DELEGATABLE_ADMIN_PERMISSIONS) {
    if (adminPermissionSetHas(expanded, p.key)) out.add(p.key);
  }
  for (const p of SUPER_ADMIN_ONLY_PERMISSIONS) {
    if (adminPermissionSetHas(expanded, p)) out.add(p);
  }
  return [...out];
}

export function permissionLabel(key: string): string {
  const perm = DELEGATABLE_ADMIN_PERMISSIONS.find((p) => p.key === key);
  return perm ? translate(perm.labelKey) : key;
}

/** Pestañas del panel → permiso requerido */
export const ADMIN_NAV_PERMISSIONS: Record<string, string> = {
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

export const ADMIN_NAV_ORDER = [
  "/admin",
  "/admin/users",
  "/admin/roles",
  "/admin/logs",
  "/admin/goals",
  "/admin/tools",
  "/admin/support",
] as const;

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

export function canAccessAdminPathByPermissions(
  permissions: string[] | null | undefined,
  pathname: string,
  isSuper = false,
): boolean {
  if (isSuper) return true;
  const set = expandAdminPermissionSet(permissions);
  if (pathname.startsWith("/admin/users/") && pathname.includes("/permissions")) {
    return adminPermissionSetHas(set, "gestionar_usuarios");
  }
  if (pathname.startsWith("/admin/export/users")) return adminPermissionSetHas(set, "gestionar_usuarios");
  if (pathname.startsWith("/admin/export/logs")) return adminPermissionSetHas(set, "ver_logs");
  if (pathname.startsWith("/admin/users")) return adminPermissionSetHas(set, "gestionar_usuarios");
  if (pathname.startsWith("/admin/groups")) return adminPermissionSetHas(set, "gestionar_usuarios");
  if (pathname.startsWith("/admin/modules")) return adminPermissionSetHas(set, "gestionar_roles_permisos");
  if (pathname.startsWith("/admin/tools")) return adminPermissionSetHas(set, "ver_metricas");
  if (pathname.startsWith("/admin/support")) return adminPermissionSetHas(set, "gestionar_soporte");
  if (pathname.startsWith("/admin/goals")) return adminPermissionSetHas(set, "gestionar_metas");
  if (pathname.startsWith("/admin/roles")) return adminPermissionSetHas(set, "gestionar_roles_permisos");
  if (pathname.startsWith("/admin/logs")) return adminPermissionSetHas(set, "ver_logs");
  if (pathname === "/admin") return adminPermissionSetHas(set, "ver_resumen");
  return false;
}

export function canAccessAdminPath(profile: AdminAccessProfile, pathname: string): boolean {
  if (!hasAnyAdminAccess(profile)) return false;
  if (isSuperAdmin(profile)) return true;
  return canAccessAdminPathByPermissions(resolvedAdminKeys(profile), pathname, false);
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
      if (mapped && DELEGATABLE_KEYS.has(mapped)) out.add(mapped);
    }
  }
  return [...out];
}
