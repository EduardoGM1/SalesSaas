import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessProfile } from "@/lib/auth/permissions";
import { hasAnyAdminAccess, hasPermission } from "@/lib/auth/permissions";
import type { ApiAuth } from "@/lib/api/auth";

export type ApiAdminAuth =
  | { ok: true; supabase: SupabaseClient; userId: string; profile: AdminAccessProfile }
  | { ok: false; status: number; message: string };

export async function requireApiAdmin(auth: ApiAuth, perm: string): Promise<ApiAdminAuth> {
  if (!auth.ok) return auth;

  const { data: profile, error } = await auth.supabase
    .from("profiles")
    .select("id, role, is_super_admin, admin_permissions")
    .eq("id", auth.userId)
    .single();

  if (error || !profile || profile.role !== "admin") {
    return { ok: false, status: 403, message: "No autorizado." };
  }

  const adminProfile: AdminAccessProfile = {
    id: profile.id,
    role: profile.role,
    is_super_admin: profile.is_super_admin ?? false,
    admin_permissions: profile.admin_permissions ?? [],
  };

  if (!hasAnyAdminAccess(adminProfile)) {
    return { ok: false, status: 403, message: "No autorizado." };
  }

  if (!hasPermission(adminProfile, perm)) {
    return { ok: false, status: 403, message: "No tienes permiso para esta acción." };
  }

  return { ok: true, supabase: auth.supabase, userId: auth.userId, profile: adminProfile };
}
