import { ServiceError } from "../lib/service-error.js";
import { isSuperAdmin } from "@salesapp/shared/auth/permissions.js";
import {
  ALL_PERMISSION_KEYS,
  OVERRIDABLE_APP_FEATURES,
  PERMISSION_CATALOG,
} from "@salesapp/shared/auth/permission-catalog.js";
import {
  featureAllowlistFromResolved,
  overridesFromFeatureAllowlist,
  resolveUserPermissions,
} from "@salesapp/shared/auth/resolve-permissions.js";
import { ADMIN_AUDIT_ACTIONS, writeAdminLog } from "./admin-audit-service.js";
import { createServiceSupabaseClient } from "../lib/supabase-server.js";

function assertSuperAdmin(profile) {
  if (!isSuperAdmin(profile)) throw new ServiceError("No autorizado.", 403);
}

/**
 * @param {{ full?: boolean }} [opts] full=true (default) exige Superadmin y devuelve permission_keys.
 * full=false: lista ligera para asignar rol en Usuarios (gestionar_usuarios).
 * En full también incluye roles tenant (empresa_id set) para visibilidad en Panel.
 */
export async function listRoles(supabase, adminProfile, opts = {}) {
  const full = opts.full !== false;
  if (full) {
    assertSuperAdmin(adminProfile);
    const { data, error } = await supabase.rpc("admin_list_roles");
    if (error) throw new ServiceError(error.message, 400);
    const platform = (Array.isArray(data) ? data : [])
      .filter((r) => !r.empresa_id)
      .map((r) => ({ ...r, capa: "plataforma", empresa_nombre: null }));

    // Tenant roles viven en BD; admin_list_roles (0066) los excluye a propósito.
    // El Panel debe mostrarlos diferenciados (Globales vs Tenant) — no están pérdida de datos.
    const admin = createServiceSupabaseClient() || supabase;
    const { data: tenantRows, error: tErr } = await admin
      .from("roles")
      .select("id, nombre, slug, es_sistema, scope, empresa_id, created_at, empresas(nombre), rol_permisos(permisos(clave))")
      .not("empresa_id", "is", null)
      .order("slug");
    if (tErr) throw new ServiceError(tErr.message, 400);

    const tenant = (tenantRows || []).map((r) => ({
      id: r.id,
      nombre: r.nombre,
      slug: r.slug,
      es_sistema: r.es_sistema,
      scope: r.scope || "workspace",
      empresa_id: r.empresa_id,
      empresa_nombre: r.empresas?.nombre || null,
      created_at: r.created_at,
      capa: "tenant",
      permission_keys: (r.rol_permisos || [])
        .map((rp) => rp.permisos?.clave)
        .filter(Boolean)
        .sort(),
    }));

    return [...platform, ...tenant];
  }
  const { data, error } = await supabase
    .from("roles")
    .select("id, nombre, slug, es_sistema")
    .is("empresa_id", null)
    .neq("slug", "superadmin")
    .order("nombre");
  if (error) throw new ServiceError(error.message, 400);
  return (data ?? []).map((r) => ({ ...r, permission_keys: [], capa: "plataforma" }));
}

export async function listPermissionCatalog() {
  return PERMISSION_CATALOG;
}

const FLAG_TO_TOOL_PERM = {
  survey: "herramientas:survey",
  proyeccion_vacaciones: "herramientas:vacaciones",
  worksheet: "herramientas:worksheet",
  analysis: "herramientas:analysis",
};

/** Deriva permission_keys de herramientas a partir de flag_keys de módulos. */
export function permissionKeysFromFlagKeys(flagKeys, baseKeys = []) {
  const flags = new Set((flagKeys || []).map(String));
  const next = new Set(
    (baseKeys || []).filter((k) => ALL_PERMISSION_KEYS.includes(k) && !String(k).startsWith("herramientas:")),
  );
  for (const [flagClave, perm] of Object.entries(FLAG_TO_TOOL_PERM)) {
    if (flags.has(flagClave)) next.add(perm);
  }
  if (flags.has("survey")) next.add("herramientas:survey");
  return [...next];
}

export async function createRole(supabase, adminProfile, body, actorId = null) {
  assertSuperAdmin(adminProfile);
  const name = String(body?.nombre ?? "").trim();
  if (!name) throw new ServiceError("Nombre requerido.");
  const flagKeys = Array.isArray(body?.flag_keys) ? body.flag_keys.map(String) : null;
  const clean = flagKeys
    ? permissionKeysFromFlagKeys(flagKeys, body?.permission_keys)
    : (Array.isArray(body?.permission_keys) ? body.permission_keys : []).filter((k) => ALL_PERMISSION_KEYS.includes(k));
  const { data, error } = await supabase.rpc("admin_create_role", {
    p_nombre: name,
    p_permission_keys: clean,
  });
  if (error) throw new ServiceError(error.message, 400);
  const roleId = data;
  if (flagKeys) {
    const { replaceRoleFlagRules } = await import("./flags-service.js");
    await replaceRoleFlagRules(adminProfile, roleId, flagKeys);
  }
  if (actorId) {
    await writeAdminLog(supabase, {
      actorId,
      accion: ADMIN_AUDIT_ACTIONS.CREACION_ROL,
      entidadAfectada: "rol",
      entidadId: roleId,
      detalle: { nombre: name, permission_keys: clean, flag_keys: flagKeys },
    });
  }
  return { id: roleId };
}

export async function updateRole(supabase, adminProfile, roleId, body, actorId = null) {
  assertSuperAdmin(adminProfile);
  if (!roleId) throw new ServiceError("Rol inválido.");
  const flagKeys = Array.isArray(body?.flag_keys) ? body.flag_keys.map(String) : null;
  let clean = Array.isArray(body?.permission_keys)
    ? body.permission_keys.filter((k) => ALL_PERMISSION_KEYS.includes(k))
    : null;
  if (flagKeys) {
    const { data: existing } = await supabase.rpc("admin_list_roles");
    const current = (existing ?? []).find((r) => r.id === roleId);
    clean = permissionKeysFromFlagKeys(flagKeys, current?.permission_keys || []);
  }
  if (clean == null) clean = [];
  const { error } = await supabase.rpc("admin_update_role_permissions", {
    p_rol_id: roleId,
    p_nombre: body?.nombre ?? null,
    p_permission_keys: clean,
  });
  if (error) throw new ServiceError(error.message, 400);
  if (flagKeys) {
    const { replaceRoleFlagRules } = await import("./flags-service.js");
    await replaceRoleFlagRules(adminProfile, roleId, flagKeys);
  }
  if (actorId) {
    await writeAdminLog(supabase, {
      actorId,
      accion: ADMIN_AUDIT_ACTIONS.EDICION_ROL,
      entidadAfectada: "rol",
      entidadId: roleId,
      detalle: { nombre: body?.nombre ?? null, permission_keys: clean, flag_keys: flagKeys },
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
  // Solo aditivos: descartar denies (otorgado=false).
  const list = (Array.isArray(overrides) ? overrides : []).filter((o) => o && o.otorgado === true && o.clave);
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

/**
 * Features UI → solo overrides aditivos.
 * - Conserva overrides no-feature existentes (solo otorgado=true).
 * - Para features overridables: escribe otorgado=true solo en las habilitadas.
 * - No crea denies; quitar una feature del rol requiere cambiar el rol.
 */
export async function setUserFeatureAllowlist(supabase, adminProfile, targetId, enabledKeys, options = {}) {
  assertSuperAdmin(adminProfile);
  const raw = (Array.isArray(enabledKeys) ? enabledKeys : []).filter((k) =>
    OVERRIDABLE_APP_FEATURES.includes(k),
  );
  const featureOverrides = overridesFromFeatureAllowlist(raw);
  const featureSet = new Set(OVERRIDABLE_APP_FEATURES);

  const { data: existing } = await supabase
    .from("usuario_permisos_override")
    .select("otorgado, permisos(clave)")
    .eq("usuario_id", targetId);

  const merged = [];
  for (const row of existing ?? []) {
    const clave = row.permisos?.clave;
    if (clave && !featureSet.has(clave) && row.otorgado === true) {
      merged.push({ clave, otorgado: true });
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

  return {
    profile,
    role: roleRow,
    permission_keys: [...resolved],
    feature_allowlist: featureAllowlistFromResolved(resolved),
    overrides,
  };
}
