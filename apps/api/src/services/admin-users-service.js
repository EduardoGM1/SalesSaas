import { ServiceError } from "../lib/service-error.js";
import {
  adminPermissionSetHas,
  expandAdminPermissionSet,
  isSuperAdmin,
  sanitizeDelegatedPermissions,
} from "@salesapp/shared/auth/permissions.js";
import { sanitizeVendorFeatures } from "@salesapp/shared/auth/user-features.js";
import { assertCanMutateTargetUser, loadTargetProfile } from "../lib/admin-peer-guard.js";
import { ADMIN_AUDIT_ACTIONS, writeAdminLog } from "./admin-audit-service.js";

function actorHasPerm(adminProfile, permissionKeys, clave) {
  if (isSuperAdmin(adminProfile)) return true;
  const set = expandAdminPermissionSet([
    ...(permissionKeys || []),
    ...(adminProfile?.admin_permissions || []),
  ]);
  return adminPermissionSetHas(set, clave);
}

const ROLES = new Set(["liner", "vendedor", "admin"]); // vendedor = alias legacy API

const SYSTEM_ROLE_IDS = {
  admin: "a0000000-0000-4000-8000-000000000002",
  liner: "a0000000-0000-4000-8000-000000000003",
  /** @deprecated usar liner — UUID histórico del ex-rol Vendedor */
  vendedor: "a0000000-0000-4000-8000-000000000003",
};

export async function updateUserRole(supabase, targetId, role, actorId = null, actorProfile = null) {
  if (!targetId || !ROLES.has(role)) throw new ServiceError("Datos inválidos.");
  // user_role enum legacy: liner de catálogo se persiste como 'vendedor' en profiles.role
  const legacyRole = role === "liner" ? "vendedor" : role;
  const { data: before } = await supabase.from("profiles").select("role, role_id, is_super_admin").eq("id", targetId).maybeSingle();
  if (actorProfile) assertCanMutateTargetUser(actorProfile, before, "cambios de rol");
  if (legacyRole === "admin" && actorProfile && !isSuperAdmin(actorProfile)) {
    throw new ServiceError("Solo el Superadmin puede otorgar el rol Admin.", 403);
  }
  const { error } = await supabase.rpc("admin_update_user_role", { p_target_id: targetId, p_role: legacyRole });
  if (error) throw new ServiceError(error.message, 400);
  const roleId = SYSTEM_ROLE_IDS[role === "vendedor" ? "liner" : role] ?? SYSTEM_ROLE_IDS[role];
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
      detalle: { de: before?.role ?? null, a: data?.role ?? legacyRole, role_id: data?.role_id ?? roleId, catalog_slug: role === "vendedor" ? "liner" : role },
    });
  }
  return data;
}

export async function updateUserStatus(supabase, targetId, isActive, actorId = null, actorProfile = null) {
  if (!targetId || typeof isActive !== "boolean") throw new ServiceError("Datos inválidos.");
  if (actorProfile) {
    const target = await loadTargetProfile(supabase, targetId);
    assertCanMutateTargetUser(actorProfile, target, "desactivación o activación de cuenta");
  }
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
  // Permisos del panel admin: solo Superadmin (nunca admin↔admin).
  if (!isSuperAdmin(adminProfile)) {
    throw new ServiceError("Solo el Superadmin puede gestionar permisos de administradores.", 403);
  }
  const { data: before } = await supabase.from("profiles").select("admin_permissions, role, is_super_admin").eq("id", targetId).maybeSingle();
  assertCanMutateTargetUser(adminProfile, before, "cambios de permisos");
  const sanitized = sanitizeDelegatedPermissions(Array.isArray(permissions) ? permissions.map(String) : []);
  const { error } = await supabase.rpc("admin_set_user_permissions", {
    p_target_id: targetId,
    p_permissions: sanitized,
  });
  if (error) throw new ServiceError(error.message, 400);
  const { data } = await supabase.from("profiles").select("id, admin_permissions").eq("id", targetId).single();
  if (actorId) {
    await writeAdminLog(supabase, {
      actorId,
      accion: ADMIN_AUDIT_ACTIONS.EDICION_PERMISOS_USUARIO,
      entidadAfectada: "usuario",
      entidadId: targetId,
      detalle: {
        tipo: "admin_permissions",
        de: before?.admin_permissions ?? [],
        a: data?.admin_permissions ?? sanitized,
      },
    });
  }
  return data;
}

export async function updateUserFeatures(
  supabase,
  adminProfile,
  targetId,
  permissions,
  actorId = null,
  permissionKeys = null,
) {
  const canManage = actorHasPerm(adminProfile, permissionKeys, "usuarios.gestionar_permisos");
  if (!canManage) {
    throw new ServiceError("No tienes permiso para gestionar funciones de usuario.", 403);
  }
  const target = await loadTargetProfile(supabase, targetId);
  assertCanMutateTargetUser(adminProfile, target, "cambios de funciones");
  const enabled = Array.isArray(permissions) ? permissions.map(String) : [];
  try {
    const { setUserFeatureAllowlist } = await import("./roles-service.js");
    await setUserFeatureAllowlist(supabase, adminProfile, targetId, enabled, {
      skipAudit: true,
      allowDelegated: !isSuperAdmin(adminProfile),
    });
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
