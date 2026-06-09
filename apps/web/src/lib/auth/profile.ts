import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAdminProfile } from "@/lib/admin/guard";
import { hasAnyAdminAccess } from "@/lib/auth/permissions";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: "vendedor" | "gerente" | "admin";
  is_super_admin?: boolean;
  admin_permissions?: string[];
}

/** Devuelve el perfil del usuario autenticado (o null si no hay sesión). */
export const getCurrentProfile = cache(async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_super_admin, admin_permissions")
    .eq("id", user.id)
    .single();

  if (!data) {
    return { id: user.id, email: user.email ?? null, full_name: null, role: "vendedor" };
  }
  return data as Profile;
});

export async function isCurrentUserAdmin(): Promise<boolean> {
  const profile = await getAdminProfile();
  return profile ? hasAnyAdminAccess(profile) : false;
}
