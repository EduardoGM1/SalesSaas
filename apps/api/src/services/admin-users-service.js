import { ServiceError } from "../lib/service-error.js";
import { isSuperAdmin, sanitizeDelegatedPermissions } from "@salesapp/shared/auth/permissions.js";
import { sanitizeVendorFeatures } from "@salesapp/shared/auth/user-features.js";

const ROLES = new Set(["vendedor", "admin"]);

export async function updateUserRole(supabase, targetId, role) {
  if (!targetId || !ROLES.has(role)) throw new ServiceError("Datos inválidos.");
  const { error } = await supabase.rpc("admin_update_user_role", { p_target_id: targetId, p_role: role });
  if (error) throw new ServiceError(error.message, 400);
  const { data } = await supabase.from("profiles").select("id, role").eq("id", targetId).single();
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
  const sanitized = sanitizeVendorFeatures(Array.isArray(permissions) ? permissions.map(String) : []);
  const { error } = await supabase.rpc("admin_set_user_features", {
    p_target_id: targetId,
    p_permissions: sanitized,
  });
  if (error) throw new ServiceError(error.message, 400);
  const { data } = await supabase.from("profiles").select("id, user_permissions").eq("id", targetId).single();
  return data;
}
