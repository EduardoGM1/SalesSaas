import { OVERRIDABLE_APP_FEATURES } from "./permission-catalog.js";

export const VENDOR_FEATURE_PERMISSIONS = [
  { key: "sales:view_modal", labelKey: "admin.perm.salesViewModal" },
  { key: "sales:view_detail", labelKey: "admin.perm.salesViewDetail" },
  { key: "sales:history", labelKey: "admin.perm.salesHistory" },
  { key: "herramientas:survey", labelKey: "admin.perm.toolSurvey" },
  { key: "herramientas:vacaciones", labelKey: "admin.perm.toolVacaciones" },
  { key: "herramientas:worksheet", labelKey: "admin.perm.toolWorksheet" },
  { key: "herramientas:analysis", labelKey: "admin.perm.toolAnalysis" },
];

const VENDOR_FEATURE_KEYS = new Set([
  ...VENDOR_FEATURE_PERMISSIONS.map((p) => p.key),
  ...OVERRIDABLE_APP_FEATURES,
]);

export function hasUserFeature(profile, key) {
  if (!profile) return true;
  if (profile.role === "admin" && String(key).startsWith("sales:")) return true;
  if (Array.isArray(profile.permission_keys)) {
    return profile.permission_keys.includes(key);
  }
  if (String(key).startsWith("herramientas:")) return true;
  const perms = profile.user_permissions;
  if (!perms?.length) return true;
  return perms.includes(key);
}

export function sanitizeVendorFeatures(perms) {
  return perms.filter((p) => VENDOR_FEATURE_KEYS.has(p));
}
