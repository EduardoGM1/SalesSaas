

import { hasAnyAdminAccess, hasPermission } from "./auth/permissions.js";



  | { ok: true; supabase: SupabaseClient; userId: string; profile: AdminAccessProfile }
  | { ok: false; status: number; message: string };

export async function requireApiAdmin(auth, perm): Promise<ApiAdminAuth> {
  if (!auth.ok) return auth;

  const { data, error } = await auth.supabase
    .from("profiles")
    .select("id, role, is_super_admin, admin_permissions")
    .eq("id", auth.userId)
    .single();

  if (error || !profile || profile.role !== "admin") {
    return { ok, status: 403, message: "No autorizado." };
  }

  const adminProfile= {
    id: profile.id,
    role: profile.role,
    is_super_admin: profile.is_super_admin ?? false,
    admin_permissions: profile.admin_permissions ?? [],
  };

  if (!hasAnyAdminAccess(adminProfile)) {
    return { ok, status: 403, message: "No autorizado." };
  }

  if (!hasPermission(adminProfile, perm)) {
    return { ok, status: 403, message: "No tienes permiso para esta acción." };
  }

  return { ok, supabase: auth.supabase, userId: auth.userId, profile: adminProfile };
}
