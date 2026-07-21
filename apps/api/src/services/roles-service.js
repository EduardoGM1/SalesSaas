import { ServiceError } from "../lib/service-error.js";
import { isSuperAdmin } from "@salesapp/shared/auth/permissions.js";
import {
  ALL_PERMISSION_KEYS,
  OVERRIDABLE_APP_FEATURES,
  PERMISSION_CATALOG,
} from "@salesapp/shared/auth/permission-catalog.js";
import {
  buildPermissionOriginMatrix,
  featureAllowlistFromResolved,
  overridesFromFeatureAllowlist,
  resolveUserPermissions,
} from "@salesapp/shared/auth/resolve-permissions.js";
import { ADMIN_AUDIT_ACTIONS, writeAdminLog } from "./admin-audit-service.js";

function assertSuperAdmin(profile) {
  if (!isSuperAdmin(profile)) throw new ServiceError("No autorizado.", 403);
}

/**
 * @param {{ full?: boolean }} [opts] full=true (default) exige Superadmin y devuelve permission_keys.
 * full=false: lista ligera para asignar rol en Usuarios (gestionar_usuarios).
 */
export async function listRoles(supabase, adminProfile, opts = {}) {
  const full = opts.full !== false;
  if (full) {
    assertSuperAdmin(adminProfile);
    const { data, error } = await supabase.rpc("admin_list_roles");
    if (error) throw new ServiceError(error.message, 400);
    return data ?? [];
  }
  const { data, error } = await supabase
    .from("roles")
    .select("id, nombre, slug, es_sistema")
    .neq("slug", "superadmin")
    .order("nombre");
  if (error) throw new ServiceError(error.message, 400);
  return (data ?? []).map((r) => ({ ...r, permission_keys: [] }));
}

export async function listPermissionCatalog() {
  return PERMISSION_CATALOG;
}

export async function createRole(supabase, adminProfile, { nombre, permission_keys: keys }, actorId = null) {
  assertSuperAdmin(adminProfile);
  const name = String(nombre ?? "").trim();
  if (!name) throw new ServiceError("Nombre requerido.");
  const clean = (Array.isArray(keys) ? keys : []).filter((k) => ALL_PERMISSION_KEYS.includes(k));
  const { data, error } = await supabase.rpc("admin_create_role", {
    p_nombre: name,
    p_permission_keys: clean,
  });
  if (error) throw new ServiceError(error.message, 400);
  const roleId = data;
  if (actorId) {
    await writeAdminLog(supabase, {
      actorId,
      accion: ADMIN_AUDIT_ACTIONS.CREACION_ROL,
      entidadAfectada: "rol",
      entidadId: roleId,
      detalle: { nombre: name, permission_keys: clean },
    });
  }
  return { id: roleId };
}

export async function updateRole(supabase, adminProfile, roleId, { nombre, permission_keys: keys }, actorId = null) {
  assertSuperAdmin(adminProfile);
  if (!roleId) throw new ServiceError("Rol inválido.");
  const clean = (Array.isArray(keys) ? keys : []).filter((k) => ALL_PERMISSION_KEYS.includes(k));
  const { error } = await supabase.rpc("admin_update_role_permissions", {
    p_rol_id: roleId,
    p_nombre: nombre ?? null,
    p_permission_keys: clean,
  });
  if (error) throw new ServiceError(error.message, 400);
  if (actorId) {
    await writeAdminLog(supabase, {
      actorId,
      accion: ADMIN_AUDIT_ACTIONS.EDICION_ROL,
      entidadAfectada: "rol",
      entidadId: roleId,
      detalle: { nombre: nombre ?? null, permission_keys: clean },
    });
  }
  return { ok: true };
}

export async function deleteRole(supabase, adminProfile, roleId, actorId = null) {
  assertSuperAdmin(adminProfile);
  if (!roleId) throw new ServiceError("Rol inválido.");
  const { data: before } = await supabase.from("roles").select("id, nombre, slug").eq("id", roleId).maybeSingle();
  const { error } = await supabase.rpc("admin_delete_role", { p_rol_id: roleId });
  if (error) throw new ServiceError(error.message, 400);
  if (actorId) {
    await writeAdminLog(supabase, {
      actorId,
      accion: ADMIN_AUDIT_ACTIONS.ELIMINACION_ROL,
      entidadAfectada: "rol",
      entidadId: roleId,
      detalle: { nombre: before?.nombre ?? null, slug: before?.slug ?? null },
    });
  }
  return { ok: true };
}

export async function setUserRoleId(supabase, adminProfile, targetId, roleId, actorId = null) {
  assertSuperAdmin(adminProfile);
  if (!targetId || !roleId) throw new ServiceError("Datos inválidos.");
  const { data: before } = await supabase
    .from("profiles")
    .select("role, role_id")
    .eq("id", targetId)
    .maybeSingle();
  let nombreDe = before?.role || null;
  if (before?.role_id) {
    const { data: r } = await supabase.from("roles").select("nombre").eq("id", before.role_id).maybeSingle();
    if (r?.nombre) nombreDe = r.nombre;
  }
  const { error } = await supabase.rpc("admin_set_user_role_id", {
    p_target_id: targetId,
    p_rol_id: roleId,
  });
  if (error) throw new ServiceError(error.message, 400);
  const { data } = await supabase
    .from("profiles")
    .select("id, role, role_id, admin_permissions, user_permissions")
    .eq("id", targetId)
    .single();
  let nombreA = data?.role || null;
  if (data?.role_id) {
    const { data: r2 } = await supabase.from("roles").select("nombre").eq("id", data.role_id).maybeSingle();
    if (r2?.nombre) nombreA = r2.nombre;
  }
  if (actorId) {
    await writeAdminLog(supabase, {
      actorId,
      accion: ADMIN_AUDIT_ACTIONS.CAMBIO_ROL,
      entidadAfectada: "usuario",
      entidadId: targetId,
      detalle: {
        de: nombreDe,
        a: nombreA,
        role_id_de: before?.role_id ?? null,
        role_id_a: data?.role_id ?? roleId,
      },
    });
  }
  return data;
}

export async function setUserOverrides(supabase, adminProfile, targetId, overrides, actorId = null, { skipAudit = false } = {}) {
  assertSuperAdmin(adminProfile);
  if (!targetId) throw new ServiceError("Usuario inválido.");
  const overridable = new Set(
    PERMISSION_CATALOG.filter((p) => p.permite_override === true).map((p) => p.clave),
  );
  const list = (Array.isArray(overrides) ? overrides : []).filter((o) => overridable.has(o?.clave));
  const { error } = await supabase.rpc("admin_set_user_permission_overrides", {
    p_target_id: targetId,
    p_overrides: list,
  });
  if (error) throw new ServiceError(error.message, 400);
  if (actorId && !skipAudit) {
    await writeAdminLog(supabase, {
      actorId,
      accion: ADMIN_AUDIT_ACTIONS.EDICION_PERMISOS_USUARIO,
      entidadAfectada: "usuario",
      entidadId: targetId,
      detalle: { tipo: "overrides", overrides: list },
    });
  }
  return { ok: true };
}

/** Allowlist UI → mergea overrides de features overridables sin borrar otros. */
export async function setUserFeatureAllowlist(supabase, adminProfile, targetId, enabledKeys, options = {}) {
  assertSuperAdmin(adminProfile);
  const raw = (Array.isArray(enabledKeys) ? enabledKeys : []).filter((k) =>
    OVERRIDABLE_APP_FEATURES.includes(k),
  );
  const allOn = raw.length === 0 || OVERRIDABLE_APP_FEATURES.every((k) => raw.includes(k));
  const featureOverrides = allOn ? [] : overridesFromFeatureAllowlist(raw);
  const featureSet = new Set(OVERRIDABLE_APP_FEATURES);

  const { data: existing } = await supabase
    .from("usuario_permisos_override")
    .select("otorgado, permisos(clave)")
    .eq("usuario_id", targetId);

  const merged = [];
  for (const row of existing ?? []) {
    const clave = row.permisos?.clave;
    if (clave && !featureSet.has(clave)) {
      merged.push({ clave, otorgado: row.otorgado === true });
    }
  }
  merged.push(...featureOverrides);
  return setUserOverrides(supabase, adminProfile, targetId, merged, options.actorId || null, {
    skipAudit: options.skipAudit === true,
  });
}

export async function loadUserPermissionContext(supabase, userId) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, role, is_super_admin, admin_permissions, user_permissions, role_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  if (!profile) return null;

  let rolePermissionKeys = [];
  if (profile.role_id) {
    const { data: rp } = await supabase
      .from("rol_permisos")
      .select("permiso_id, permisos(clave)")
      .eq("rol_id", profile.role_id);
    rolePermissionKeys = (rp ?? []).map((r) => r.permisos?.clave).filter(Boolean);
  }

  const { data: ovRows } = await supabase
    .from("usuario_permisos_override")
    .select("otorgado, permisos(clave)")
    .eq("usuario_id", userId);

  const overrides = (ovRows ?? []).map((r) => ({
    clave: r.permisos?.clave,
    otorgado: r.otorgado === true,
  })).filter((o) => o.clave);

  const { data: roleRow } = profile.role_id
    ? await supabase.from("roles").select("id, nombre, slug, es_sistema").eq("id", profile.role_id).maybeSingle()
    : { data: null };

  const resolved = resolveUserPermissions({
    is_super_admin: profile.is_super_admin === true,
    role: profile.role,
    role_permission_keys: rolePermissionKeys,
    overrides,
    admin_permissions: profile.admin_permissions ?? [],
    user_permissions: profile.user_permissions ?? [],
  });

  const origin_matrix = buildPermissionOriginMatrix({
    is_super_admin: profile.is_super_admin === true,
    role: profile.role,
    role_permission_keys: rolePermissionKeys,
    overrides,
  });

  return {
    profile,
    role: roleRow,
    role_permission_keys: rolePermissionKeys,
    permission_keys: [...resolved],
    feature_allowlist: featureAllowlistFromResolved(resolved),
    overrides,
    origin_matrix,
  };
}
