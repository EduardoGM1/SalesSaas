import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AdminAccessProfile } from "@/lib/auth/permissions";
import { hasAnyAdminAccess, hasPermission } from "@/lib/auth/permissions";

export async function getAdminProfile(): Promise<AdminAccessProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, is_super_admin, admin_permissions")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") return null;

  return {
    id: profile.id,
    role: profile.role,
    is_super_admin: profile.is_super_admin ?? false,
    admin_permissions: profile.admin_permissions ?? [],
  };
}

/** Cliente Supabase solo si el usuario actual es admin con algún acceso. */
export async function requireAdmin() {
  const supabase = await createClient();
  const profile = await getAdminProfile();
  if (!profile || !hasAnyAdminAccess(profile)) redirect("/");
  return { supabase, userId: profile.id, profile };
}

/** Admin con permiso específico; si no, redirige al panel o inicio. */
export async function requireAdminPermission(perm: string) {
  const ctx = await requireAdmin();
  if (!hasPermission(ctx.profile, perm)) redirect("/");
  return ctx;
}
