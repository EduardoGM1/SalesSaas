/** Permisos de vendedor/gerente que el admin puede activar o desactivar. */
export const VENDOR_FEATURE_PERMISSIONS = [
  { key: "sales:view_modal", labelKey: "admin.perm.salesViewModal" },
  { key: "sales:view_detail", labelKey: "admin.perm.salesViewDetail" },
  { key: "sales:history", labelKey: "admin.perm.salesHistory" },
] as const;

export type VendorFeatureKey = (typeof VENDOR_FEATURE_PERMISSIONS)[number]["key"];

const VENDOR_FEATURE_KEYS = new Set<string>(VENDOR_FEATURE_PERMISSIONS.map((p) => p.key));

export interface UserFeatureProfile {
  role?: string;
  user_permissions?: string[];
}

/** Vacío = todas activas (compatibilidad). Admin siempre tiene acceso. */
export function hasUserFeature(profile: UserFeatureProfile | null | undefined, key: VendorFeatureKey): boolean {
  if (!profile) return true;
  if (profile.role === "admin") return true;
  const perms = profile.user_permissions;
  if (!perms?.length) return true;
  return perms.includes(key);
}

export function sanitizeVendorFeatures(perms: string[]): VendorFeatureKey[] {
  return perms.filter((p): p is VendorFeatureKey => VENDOR_FEATURE_KEYS.has(p));
}
