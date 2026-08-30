/**
 * Guards HTTP de admin. No relajan Superadmin ni requireApiAdmin.
 */
import { authenticateApi } from "../middleware/auth.js";
import { requireApiAdmin } from "../middleware/admin-auth.js";
import { apiError } from "../lib/http.js";
import { isSuperAdmin } from "@salesapp/shared/auth/permissions.js";

export async function adminAuth(req, res, perm) {
  const base = await authenticateApi(req, res);
  if (!base.ok) {
    apiError(res, base.message, base.status);
    return null;
  }
  const a = await requireApiAdmin(base, perm);
  if (!a.ok) {
    apiError(res, a.message, a.status);
    return null;
  }
  return a;
}

/** Roles CRUD / role_id: solo Superadmin. */
export async function requireSuperAdminApi(req, res) {
  const base = await authenticateApi(req, res);
  if (!base.ok) {
    apiError(res, base.message, base.status);
    return null;
  }
  const { data: profile } = await base.supabase
    .from("profiles")
    .select("id, role, is_super_admin, admin_permissions")
    .eq("id", base.userId)
    .single();
  if (!profile || !isSuperAdmin(profile)) {
    apiError(res, "No autorizado.", 403);
    return null;
  }
  return { ...base, profile };
}
