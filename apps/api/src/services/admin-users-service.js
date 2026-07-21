import { ServiceError } from "../lib/service-error.js";
import { isSuperAdmin, sanitizeDelegatedPermissions } from "@salesapp/shared/auth/permissions.js";
import { sanitizeVendorFeatures } from "@salesapp/shared/auth/user-features.js";
import { ADMIN_AUDIT_ACTIONS, writeAdminLog } from "./admin-audit-service.js";

const ROLES = new Set(["vendedor", "admin"]);

const SYSTEM_ROLE_IDS = {
  admin: "a0000000-0000-4000-8000-000000000002",
  vendedor: "a0000000-0000-4000-8000-000000000003",
};

export async function updateUserRole(supabase, targetId, role, actorId = null) {
  if (!targetId || !ROLES.has(role)) throw new ServiceError("Datos inválidos.");
  const { data: before } = await supabase.from("profiles").select("role, role_id").eq("id", targetId).maybeSingle();
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
  if (actorId) {
    await writeAdminLog(supabase, {
      actorId,
      accion: ADMIN_AUDIT_ACTIONS.CAMBIO_ROL,
      entidadAfectada: "usuario",
      entidadId: targetId,
      detalle: { de: before?.role ?? null, a: data?.role ?? role, role_id: data?.role_id ?? roleId },
    });
  }
  return data;
}

export async function updateUserStatus(supabase, targetId, isActive, actorId = null) {
  if (!targetId || typeof isActive !== "boolean") throw new ServiceError("Datos inválidos.");
  const { error } = await supabase.rpc("admin_set_user_active", { p_target_id: targetId, p_active: isActive });
  if (error) throw new ServiceError(error.message, 400);
  const { data } = await supabase.from("profiles").select("id, is_active").eq("id", targetId).single();
  if (actorId) {
    await writeAdminLog(supabase, {
      actorId,
      accion: isActive ? ADMIN_AUDIT_ACTIONS.ACTIVACION_CUENTA : ADMIN_AUDIT_ACTIONS.DESACTIVACION_CUENTA,
      entidadAfectada: "usuario",
      entidadId: targetId,
      detalle: { is_active: isActive },
    });
  }
  return data;
}

export async function updateUserPermissions(supabase, adminProfile, targetId, permissions, actorId = null) {
  if (!isSuperAdmin(adminProfile)) throw new ServiceError("No autorizado.", 403);
  const sanitized = sanitizeDelegatedPermissions(Array.isArray(permissions) ? permissions.map(String) : []);
  // Escribe overrides relativos al rol (RPC 0050); admin_permissions queda como proyección sync.
  const { error } = await supabase.rpc("admin_set_user_permissions", {
    p_target_id: targetId,
    p_permissions: sanitized,
  });
  if (error) throw new ServiceError(error.message, 400);
  const { data } = await supabase
    .from("profiles")
    .select("id, admin_permissions, role_id")
    .eq("id", targetId)
    .single();
  if (actorId) {
    await writeAdminLog(supabase, {
      actorId,
      accion: ADMIN_AUDIT_ACTIONS.EDICION_PERMISOS_USUARIO,
      entidadAfectada: "usuario",
      entidadId: targetId,
      detalle: {
        tipo: "admin_section_overrides",
        a: sanitized,
      },
    });
  }
  return data;
}

export async function updateUserFeatures(supabase, adminProfile, targetId, permissions, actorId = null) {
  if (!isSuperAdmin(adminProfile)) throw new ServiceError("No autorizado.", 403);
  const enabled = Array.isArray(permissions) ? permissions.map(String) : [];
  try {
    const { setUserFeatureAllowlist } = await import("./roles-service.js");
    await setUserFeatureAllowlist(supabase, adminProfile, targetId, enabled, { skipAudit: true });
    const { data } = await supabase
      .from("profiles")
      .select("id, user_permissions, role_id")
      .eq("id", targetId)
      .single();
    if (actorId) {
      await writeAdminLog(supabase, {
        actorId,
        accion: ADMIN_AUDIT_ACTIONS.EDICION_PERMISOS_USUARIO,
        entidadAfectada: "usuario",
        entidadId: targetId,
        detalle: { tipo: "features_overrides", a: enabled },
      });
    }
    return data;
  } catch (err) {
    const sanitized = sanitizeVendorFeatures(enabled);
    const { error } = await supabase.rpc("admin_set_user_features", {
      p_target_id: targetId,
      p_permissions: sanitized,
    });
    if (error) throw new ServiceError(error.message || err.message, 400);
    const { data } = await supabase.from("profiles").select("id, user_permissions").eq("id", targetId).single();
    if (actorId) {
      await writeAdminLog(supabase, {
        actorId,
        accion: ADMIN_AUDIT_ACTIONS.EDICION_PERMISOS_USUARIO,
        entidadAfectada: "usuario",
        entidadId: targetId,
        detalle: { tipo: "features_legacy", a: sanitized },
      });
    }
    return data;
  }
}
