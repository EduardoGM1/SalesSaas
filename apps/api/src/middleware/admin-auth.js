import {
  adminPermissionSetHas,
  expandAdminPermissionSet,
  hasAnyAdminAccess,
  hasAnyAdminNavPermission,
  isSuperAdmin,
} from "@salesapp/shared/auth/permissions.js";
import * as rolesService from "../services/roles-service.js";

/**
 * Auth admin alineada con /admin/me: rol + overrides (permission_keys),
 * no solo profiles.admin_permissions (legacy).
 */
export async function requireApiAdmin(auth, perm) {
  if (!auth.ok) return auth;

  const { data: profile, error } = await auth.supabase
    .from("profiles")
    .select("id, role, is_super_admin, admin_permissions, role_id")
    .eq("id", auth.userId)
    .single();

  if (error || !profile || profile.role !== "admin") {
    return { ok: false, status: 403, message: "No autorizado." };
  }

  const adminProfile = {
    id: profile.id,
    role: profile.role,
    is_super_admin: profile.is_super_admin ?? false,
    admin_permissions: profile.admin_permissions ?? [],
    role_id: profile.role_id ?? null,
  };

  let permissionKeys = Array.isArray(adminProfile.admin_permissions)
    ? [...adminProfile.admin_permissions]
    : [];
  try {
    const ctx = await rolesService.loadUserPermissionContext(auth.supabase, auth.userId);
    if (ctx?.permission_keys?.length) permissionKeys = ctx.permission_keys;
  } catch {
    // fallback legacy admin_permissions
  }

  const superAdmin = isSuperAdmin(adminProfile);
  if (
    !superAdmin
    && !hasAnyAdminAccess(adminProfile)
    && !hasAnyAdminNavPermission(permissionKeys)
  ) {
    return { ok: false, status: 403, message: "No autorizado." };
  }

  if (perm && !superAdmin) {
    const set = expandAdminPermissionSet(permissionKeys);
    if (!adminPermissionSetHas(set, perm)) {
      return { ok: false, status: 403, message: "No tienes permiso para esta acción." };
    }
  }

  return {
    ok: true,
    supabase: auth.supabase,
    userId: auth.userId,
    profile: adminProfile,
    permissions: permissionKeys,
    isSuperAdmin: superAdmin,
  };
}
