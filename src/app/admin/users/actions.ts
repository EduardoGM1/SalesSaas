"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminPermission } from "@/lib/admin/guard";
import { isSuperAdmin, sanitizeDelegatedPermissions } from "@/lib/auth/permissions";

const ROLES = new Set(["vendedor", "admin"]);

function safeReturnTo(value: FormDataEntryValue | null): string {
  const path = String(value ?? "").trim();
  if (path.startsWith("/admin/users")) return path;
  return "/admin/users";
}

function redirectWithError(returnTo: string, code: string) {
  const url = returnTo.includes("?") ? `${returnTo}&error=${code}` : `${returnTo}?error=${code}`;
  redirect(url);
}

export async function updateUserRole(formData: FormData) {
  const { supabase } = await requireAdminPermission("users:role");
  const targetId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  const returnTo = safeReturnTo(formData.get("returnTo"));

  if (!targetId || !ROLES.has(role)) redirectWithError(returnTo, "invalid");

  const { error } = await supabase.rpc("admin_update_user_role", {
    p_target_id: targetId,
    p_role: role,
  });
  if (error) redirectWithError(returnTo, "role");

  revalidatePath("/admin/users");
  redirect(returnTo);
}

export async function setUserActive(formData: FormData) {
  const activeRaw = String(formData.get("is_active") ?? "");
  const isActive = activeRaw === "true";
  const perm = isActive ? "users:activate" : "users:deactivate";
  const { supabase } = await requireAdminPermission(perm);

  const targetId = String(formData.get("userId") ?? "");
  const returnTo = safeReturnTo(formData.get("returnTo"));

  if (!targetId) redirectWithError(returnTo, "invalid");

  const { error } = await supabase.rpc("admin_set_user_active", {
    p_target_id: targetId,
    p_active: isActive,
  });
  if (error) redirectWithError(returnTo, "status");

  revalidatePath("/admin/users");
  redirect(returnTo);
}

export async function updateUserPermissions(formData: FormData) {
  const { supabase, profile } = await requireAdminPermission("users:permissions");
  if (!isSuperAdmin(profile)) redirect("/admin/users");

  const targetId = String(formData.get("userId") ?? "");
  const returnTo = safeReturnTo(formData.get("returnTo"));
  const raw = formData.getAll("permissions").map(String);
  const permissions = sanitizeDelegatedPermissions(raw);

  if (!targetId) redirectWithError(returnTo, "invalid");

  const { error } = await supabase.rpc("admin_set_user_permissions", {
    p_target_id: targetId,
    p_permissions: permissions,
  });
  if (error) redirectWithError(returnTo, "permissions");

  revalidatePath("/admin/users");
  redirect(returnTo);
}
