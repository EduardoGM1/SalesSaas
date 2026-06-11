export const VENDOR_FEATURE_PERMISSIONS = [
  { key: "sales:view_modal", labelKey: "admin.perm.salesViewModal" },
  { key: "sales:view_detail", labelKey: "admin.perm.salesViewDetail" },
  { key: "sales:history", labelKey: "admin.perm.salesHistory" },
];

const VENDOR_FEATURE_KEYS = new Set(VENDOR_FEATURE_PERMISSIONS.map((p) => p.key));

export function hasUserFeature(profile, key) {
  if (!profile) return true;
  if (profile.role === "admin") return true;
  const perms = profile.user_permissions;
  if (!perms?.length) return true;
  return perms.includes(key);
}

export function sanitizeVendorFeatures(perms) {
  return perms.filter((p) => VENDOR_FEATURE_KEYS.has(p));
}
