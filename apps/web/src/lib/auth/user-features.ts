/** Permisos de vendedor que el admin puede activar o desactivar (ventas + herramientas). */
export const VENDOR_FEATURE_PERMISSIONS = [
  { key: "sales:view_modal", labelKey: "admin.perm.salesViewModal" },
  { key: "sales:view_detail", labelKey: "admin.perm.salesViewDetail" },
  { key: "sales:history", labelKey: "admin.perm.salesHistory" },
  { key: "herramientas:survey", labelKey: "admin.perm.toolSurvey" },
  { key: "herramientas:survey_configurar_preguntas", labelKey: "admin.perm.toolSurveyConfigQuestions" },
  { key: "herramientas:vacaciones", labelKey: "admin.perm.toolVacaciones" },
  { key: "herramientas:worksheet", labelKey: "admin.perm.toolWorksheet" },
  { key: "herramientas:analysis", labelKey: "admin.perm.toolAnalysis" },
] as const;

export type VendorFeatureKey = (typeof VENDOR_FEATURE_PERMISSIONS)[number]["key"];

const VENDOR_FEATURE_KEYS = new Set<string>(VENDOR_FEATURE_PERMISSIONS.map((p) => p.key));

export interface UserFeatureProfile {
  role?: string;
  user_permissions?: string[];
  permission_keys?: string[];
}

/** Vacío = todas activas (compatibilidad). Admin siempre tiene acceso a sales:*. */
export function hasUserFeature(profile: UserFeatureProfile | null | undefined, key: VendorFeatureKey): boolean {
  if (!profile) return true;
  if (profile.role === "admin" && key.startsWith("sales:")) return true;
  if (Array.isArray(profile.permission_keys)) {
    return profile.permission_keys.includes(key);
  }
  if (key.startsWith("herramientas:")) return true;
  const perms = profile.user_permissions;
  if (!perms?.length) return true;
  return perms.includes(key);
}

export function sanitizeVendorFeatures(perms: string[]): VendorFeatureKey[] {
  return perms.filter((p): p is VendorFeatureKey => VENDOR_FEATURE_KEYS.has(p));
}
