import { ServiceError } from "../lib/service-error.js";
import { isSuperAdmin, sanitizeDelegatedPermissions } from "@salesapp/shared/auth/permissions.js";
import { sanitizeVendorFeatures } from "@salesapp/shared/auth/user-features.js";

const ROLES = new Set(["vendedor", "admin"]);

const SYSTEM_ROLE_IDS = {
  admin: "a0000000-0000-4000-8000-000000000002",
  vendedor: "a0000000-0000-4000-8000-000000000003",
};

export async function updateUserRole(supabase, targetId, role) {
  if (!targetId || !ROLES.has(role)) throw new ServiceError("Datos inválidos.");
  const { error } = await supabase.rpc("admin_update_user_role", { p_target_id: targetId, p_role: role });
  if (error) throw new ServiceError(error.message, 400);
  const roleId = SYSTEM_ROLE_IDS[role];
  if (roleId) {
    await supabase.from("profiles").update({ role_id: roleId }).eq("id", targetId);
    try {
      await supabase.rpc("sync_profile_legacy_permissions", { p_user_id: targetId });
    } catch {
      // sync opcional si migración aún no aplicada
    }
  }
  const { data } = await supabase.from("profiles").select("id, role, role_id").eq("id", targetId).single();
  return data;
}

export async function updateUserStatus(supabase, targetId, isActive) {
  if (!targetId || typeof isActive !== "boolean") throw new ServiceError("Datos inválidos.");
  const { error } = await supabase.rpc("admin_set_user_active", { p_target_id: targetId, p_active: isActive });
  if (error) throw new ServiceError(error.message, 400);
  const { data } = await supabase.from("profiles").select("id, is_active").eq("id", targetId).single();
  return data;
}

export async function updateUserPermissions(supabase, adminProfile, targetId, permissions) {
  if (!isSuperAdmin(adminProfile)) throw new ServiceError("No autorizado.", 403);
  const sanitized = sanitizeDelegatedPermissions(Array.isArray(permissions) ? permissions.map(String) : []);
  const { error } = await supabase.rpc("admin_set_user_permissions", {
    p_target_id: targetId,
    p_permissions: sanitized,
  });
  if (error) throw new ServiceError(error.message, 400);
  const { data } = await supabase.from("profiles").select("id, admin_permissions").eq("id", targetId).single();
  return data;
}

export async function updateUserFeatures(supabase, adminProfile, targetId, permissions) {
  if (!isSuperAdmin(adminProfile)) throw new ServiceError("No autorizado.", 403);
  // Preferir catálogo Fase 2 (ventas + herramientas) vía overrides.
  try {
    const { setUserFeatureAllowlist } = await import("./roles-service.js");
    const enabled = Array.isArray(permissions) ? permissions.map(String) : [];
    await setUserFeatureAllowlist(supabase, adminProfile, targetId, enabled);
    const { data } = await supabase
      .from("profiles")
      .select("id, user_permissions, role_id")
      .eq("id", targetId)
      .single();
    return data;
  } catch (err) {
    // Fallback legacy si tablas aún no migradas
    const sanitized = sanitizeVendorFeatures(Array.isArray(permissions) ? permissions.map(String) : []);
    const { error } = await supabase.rpc("admin_set_user_features", {
      p_target_id: targetId,
      p_permissions: sanitized,
    });
    if (error) throw new ServiceError(error.message || err.message, 400);
    const { data } = await supabase.from("profiles").select("id, user_permissions").eq("id", targetId).single();
    return data;
  }
}
