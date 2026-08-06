/**
 * Aislamiento entre administradores de plataforma.
 * Solo Superadmin puede modificar a otro Admin (permisos, funciones, rol, plan, cuenta).
 */
import { ServiceError } from "./service-error.js";
import { isSuperAdmin } from "@salesapp/shared/auth/permissions.js";

export function assertCanMutateTargetUser(actorProfile, targetProfile, actionLabel = "esta acción") {
  if (!targetProfile) throw new ServiceError("Usuario no encontrado.", 404);
  if (targetProfile.is_super_admin === true && !isSuperAdmin(actorProfile)) {
    throw new ServiceError("No puedes modificar al administrador principal.", 403);
  }
  const targetIsAdmin = targetProfile.role === "admin" || targetProfile.is_super_admin === true;
  if (targetIsAdmin && !isSuperAdmin(actorProfile)) {
    throw new ServiceError(
      `Los administradores no pueden realizarse ${actionLabel} entre sí.`,
      403,
    );
  }
}

export async function loadTargetProfile(supabase, targetId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, is_super_admin, is_active, email, full_name")
    .eq("id", targetId)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  return data;
}
