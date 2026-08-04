import { ServiceError, assertFound } from "../lib/service-error.js";
import {
  adminClient,
  empresaFromWorkspace,
  normalizeSlug,
  requireEmpresaAdmin,
} from "../lib/tenant-access.js";

export async function listTenantRoles(actorId, empresaId) {
  const admin = await requireEmpresaAdmin(actorId, empresaId);
  const { data, error } = await admin
    .from("roles")
    .select("id, nombre, slug, scope, empresa_id, paquete_id, es_sistema, paquetes_acceso(id, nombre, slug, paquete_flags(flag_id, activo, flags(clave))), rol_permisos(permisos(clave))")
    .eq("empresa_id", empresaId)
    .order("nombre");
  if (error) throw new ServiceError(error.message, 500);
  return (data ?? []).map((role) => ({
    ...role,
    permission_keys: (role.rol_permisos ?? [])
      .map((row) => row.permisos?.clave)
      .filter(Boolean),
    flag_keys: (role.paquetes_acceso?.paquete_flags ?? [])
      .filter((row) => row.activo !== false)
      .map((row) => row.flags?.clave)
      .filter(Boolean),
    rol_permisos: undefined,
  }));
}

export async function createTenantRole(actorId, empresaId, body) {
  const admin = await requireEmpresaAdmin(actorId, empresaId);
  const nombre = String(body?.nombre || "").trim();
  const scope = body?.scope === "empresa" ? "empresa" : "workspace";
  const slug = normalizeSlug(body?.slug || nombre);
  if (!nombre || !slug) throw new ServiceError("Nombre requerido.", 400);

  let paqueteId = body?.paquete_id || null;
  if (Array.isArray(body?.flag_keys)) {
    paqueteId = await ensureRolePackageFromFlags(admin, {
      empresaId,
      actorId,
      nombre,
      slug,
      flagKeys: body.flag_keys,
      existingPackageId: paqueteId,
    });
  } else if (paqueteId) {
    const { data: pack } = await admin
      .from("paquetes_acceso")
      .select("id")
      .eq("id", paqueteId)
      .eq("empresa_id", empresaId)
      .maybeSingle();
    if (!pack) throw new ServiceError("El paquete no pertenece a la empresa.", 400);
  }

  const { data, error } = await admin
    .from("roles")
    .insert({
      nombre,
      slug,
      scope,
      empresa_id: empresaId,
      paquete_id: paqueteId,
      es_sistema: false,
    })
    .select("id, nombre, slug, scope, empresa_id, paquete_id, es_sistema")
    .single();
  if (error) throw new ServiceError(error.message, 400);

  // Permisos workflow mínimos; el acceso a herramientas lo define el paquete/flags.
  await replaceRolePermissions(admin, data.id, body?.permission_keys ?? [
    "workflow:ver",
    "workflow:avanzar",
  ]);
  return data;
}

export async function updateTenantRole(actorId, empresaId, roleId, body) {
  const admin = await requireEmpresaAdmin(actorId, empresaId);
  const { data: role } = await admin
    .from("roles")
    .select("id, nombre, slug, paquete_id, es_sistema")
    .eq("id", roleId)
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (!role) throw new ServiceError("Puesto no encontrado.", 404);

  const currentFlagKeys = await loadRoleFlagKeys(admin, role.paquete_id);

  // Sistema: renombrar siempre; módulos solo Liner/Cerrador (paquetes dedicados).
  if (role.es_sistema) {
    const patch = {};
    if (body?.nombre !== undefined) {
      const nombre = String(body.nombre).trim();
      if (!nombre) throw new ServiceError("Nombre requerido.", 400);
      patch.nombre = nombre;
    }
    if (Object.keys(patch).length) {
      const { error } = await admin.from("roles").update(patch).eq("id", roleId);
      if (error) throw new ServiceError(error.message, 400);
    }
    // Solo tocar módulos si el cliente envió flag_keys Y cambiaron de verdad.
    if (Array.isArray(body?.flag_keys) && !sameFlagKeySet(currentFlagKeys, body.flag_keys)) {
      if (!["liner", "cerrador"].includes(role.slug)) {
        throw new ServiceError("Solo Liner y Cerrador permiten ajustar módulos de sistema.", 403);
      }
      const nextKeys = normalizeFlagKeys(body.flag_keys);
      if (nextKeys.length === 0) {
        throw new ServiceError(
          "No se pueden vaciar los módulos de un puesto de sistema. Omite flag_keys para solo renombrar.",
          400,
        );
      }
      const packageId = await ensureRolePackageFromFlags(admin, {
        empresaId,
        actorId,
        nombre: patch.nombre || role.nombre,
        slug: role.slug,
        flagKeys: nextKeys,
        existingPackageId: role.paquete_id,
        systemSlug: role.slug === "liner" ? "liner" : "cierre",
      });
      if (packageId && packageId !== role.paquete_id) {
        await admin.from("roles").update({ paquete_id: packageId }).eq("id", roleId);
      }
    }
  } else {
    const patch = {};
    if (body?.nombre !== undefined) patch.nombre = String(body.nombre).trim();
    if (body?.slug !== undefined) patch.slug = normalizeSlug(body.slug);
    if (body?.scope !== undefined) patch.scope = body.scope === "empresa" ? "empresa" : "workspace";
    if (body?.paquete_id !== undefined && !Array.isArray(body?.flag_keys)) {
      if (body.paquete_id) {
        const { data: pack } = await admin
          .from("paquetes_acceso")
          .select("id")
          .eq("id", body.paquete_id)
          .eq("empresa_id", empresaId)
          .maybeSingle();
        if (!pack) throw new ServiceError("El paquete no pertenece a la empresa.", 400);
      }
      patch.paquete_id = body.paquete_id || null;
    }
    if (Array.isArray(body?.flag_keys) && !sameFlagKeySet(currentFlagKeys, body.flag_keys)) {
      patch.paquete_id = await ensureRolePackageFromFlags(admin, {
        empresaId,
        actorId,
        nombre: patch.nombre || role.nombre,
        slug: patch.slug || role.slug,
        flagKeys: normalizeFlagKeys(body.flag_keys),
        existingPackageId: role.paquete_id,
      });
    }
    if (Object.keys(patch).length) {
      const { error } = await admin.from("roles").update(patch).eq("id", roleId);
      if (error) throw new ServiceError(error.message, 400);
    }
    if (body?.permission_keys !== undefined) {
      await replaceRolePermissions(admin, roleId, body.permission_keys);
    }
  }

  const { data, error } = await admin
    .from("roles")
    .select("id, nombre, slug, scope, empresa_id, paquete_id, es_sistema, paquetes_acceso(id, nombre, slug, paquete_flags(flag_id, activo, flags(clave)))")
    .eq("id", roleId)
    .single();
  if (error) throw new ServiceError(error.message, 500);
  return {
    ...data,
    flag_keys: (data.paquetes_acceso?.paquete_flags ?? [])
      .filter((row) => row.activo !== false)
      .map((row) => row.flags?.clave)
      .filter(Boolean),
    paquetes_acceso: data.paquetes_acceso
      ? { id: data.paquetes_acceso.id, nombre: data.paquetes_acceso.nombre, slug: data.paquetes_acceso.slug }
      : null,
  };
}

export async function deleteTenantRole(actorId, empresaId, roleId) {
  const admin = await requireEmpresaAdmin(actorId, empresaId);
  const { data: role } = await admin
    .from("roles")
    .select("id, es_sistema")
    .eq("id", roleId)
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (!role) throw new ServiceError("Puesto no encontrado.", 404);
  if (role.es_sistema) throw new ServiceError("Un puesto de sistema no puede eliminarse.", 403);
  const { error } = await admin.from("roles").delete().eq("id", roleId);
  if (error?.code === "23503") throw new ServiceError("El puesto está asignado a miembros.", 409);
  if (error) throw new ServiceError(error.message, 400);
  return { ok: true };
}

async function replaceRolePermissions(admin, roleId, keys) {
  if (!Array.isArray(keys)) return;
  const clean = [...new Set(keys.map(String).filter(Boolean))];
  const { data: permissions, error } = clean.length
    ? await admin.from("permisos").select("id, clave").in("clave", clean)
    : { data: [], error: null };
  if (error) throw new ServiceError(error.message, 500);
  await admin.from("rol_permisos").delete().eq("rol_id", roleId);
  if (permissions?.length) {
    const { error: insertError } = await admin.from("rol_permisos").insert(
      permissions.map((permission) => ({ rol_id: roleId, permiso_id: permission.id })),
    );
    if (insertError) throw new ServiceError(insertError.message, 400);
  }
}

function normalizeFlagKeys(keys) {
  return [...new Set((Array.isArray(keys) ? keys : []).map(String).filter(Boolean))].sort();
}

function sameFlagKeySet(a, b) {
  const left = normalizeFlagKeys(a);
  const right = normalizeFlagKeys(b);
  if (left.length !== right.length) return false;
  return left.every((key, idx) => key === right[idx]);
}

async function loadRoleFlagKeys(admin, paqueteId) {
  if (!paqueteId) return [];
  const { data, error } = await admin
    .from("paquete_flags")
    .select("activo, flags(clave)")
    .eq("paquete_id", paqueteId);
  if (error) throw new ServiceError(error.message, 500);
  return normalizeFlagKeys(
    (data ?? [])
      .filter((row) => row.activo !== false)
      .map((row) => row.flags?.clave)
      .filter(Boolean),
  );
}

/** Crea/actualiza el paquete ligado al puesto a partir de flag_keys (módulos). */
async function ensureRolePackageFromFlags(admin, {
  empresaId,
  actorId,
  nombre,
  slug,
  flagKeys,
  existingPackageId,
  systemSlug,
}) {
  const clean = [...new Set((flagKeys || []).map(String).filter(Boolean))];
  let packageId = existingPackageId || null;

  if (!packageId) {
    const packSlug = systemSlug || `puesto-${slug || normalizeSlug(nombre)}`;
    const { data: created, error } = await admin
      .from("paquetes_acceso")
      .insert({
        empresa_id: empresaId,
        nombre: `${nombre} (módulos)`,
        slug: packSlug,
        descripcion: `Módulos del puesto ${nombre}`,
        es_sistema: Boolean(systemSlug),
        activo: true,
        creado_por: actorId || null,
      })
      .select("id")
      .single();
    if (error) {
      // Si el slug ya existe (liner/cierre), reutilizar.
      const { data: existing } = await admin
        .from("paquetes_acceso")
        .select("id")
        .eq("empresa_id", empresaId)
        .eq("slug", packSlug)
        .maybeSingle();
      if (!existing) throw new ServiceError(error.message, 400);
      packageId = existing.id;
    } else {
      packageId = created.id;
    }
  }

  await replacePackageFlags(admin, packageId, clean);
  return packageId;
}

export async function listAccessPackages(actorId, empresaId) {
  const admin = await requireEmpresaAdmin(actorId, empresaId);
  const { data, error } = await admin
    .from("paquetes_acceso")
    .select("id, empresa_id, nombre, slug, descripcion, activo, es_sistema, paquete_flags(flag_id, activo, flags(clave, nombre_visible))")
    .eq("empresa_id", empresaId)
    .order("nombre");
  if (error) throw new ServiceError(error.message, 500);
  return data ?? [];
}

export async function listTenantFlagCatalog(actorId, empresaId) {
  const admin = await requireEmpresaAdmin(actorId, empresaId);
  const { data, error } = await admin
    .from("flags")
    .select("id, clave, nombre_visible, flag_padre, default_global")
    .order("clave");
  if (error) throw new ServiceError(error.message, 500);
  return data ?? [];
}

export async function listTenantPermissionCatalog(actorId, empresaId) {
  const admin = await requireEmpresaAdmin(actorId, empresaId);
  const { data, error } = await admin
    .from("permisos")
    .select("id, clave, nombre_visible, modulo, capa")
    .order("modulo")
    .order("clave");
  if (error) throw new ServiceError(error.message, 500);
  return data ?? [];
}

export async function createAccessPackage(actorId, empresaId, body) {
  const admin = await requireEmpresaAdmin(actorId, empresaId);
  const nombre = String(body?.nombre || "").trim();
  const slug = normalizeSlug(body?.slug || nombre);
  if (!nombre || !slug) throw new ServiceError("Nombre requerido.", 400);
  const { data, error } = await admin
    .from("paquetes_acceso")
    .insert({
      empresa_id: empresaId,
      nombre,
      slug,
      descripcion: String(body?.descripcion || "").trim() || null,
      activo: body?.activo !== false,
      creado_por: actorId,
    })
    .select("id, empresa_id, nombre, slug, descripcion, activo, es_sistema")
    .single();
  if (error) throw new ServiceError(error.message, 400);
  await replacePackageFlags(admin, data.id, body?.flag_keys);
  return data;
}

export async function updateAccessPackage(actorId, empresaId, packageId, body) {
  const admin = await requireEmpresaAdmin(actorId, empresaId);
  const { data: pack } = await admin
    .from("paquetes_acceso")
    .select("id, es_sistema")
    .eq("id", packageId)
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (!pack) throw new ServiceError("Paquete no encontrado.", 404);

  const patch = { updated_at: new Date().toISOString() };
  if (body?.nombre !== undefined) patch.nombre = String(body.nombre).trim();
  if (body?.slug !== undefined) patch.slug = normalizeSlug(body.slug);
  if (body?.descripcion !== undefined) patch.descripcion = String(body.descripcion || "").trim() || null;
  if (body?.activo !== undefined) patch.activo = body.activo === true;
  const { error } = await admin.from("paquetes_acceso").update(patch).eq("id", packageId);
  if (error) throw new ServiceError(error.message, 400);
  if (body?.flag_keys !== undefined) await replacePackageFlags(admin, packageId, body.flag_keys);

  const { data } = await admin
    .from("paquetes_acceso")
    .select("id, empresa_id, nombre, slug, descripcion, activo, es_sistema")
    .eq("id", packageId)
    .single();
  return data;
}

async function replacePackageFlags(admin, packageId, keys) {
  if (!Array.isArray(keys)) return;
  const clean = [...new Set(keys.map(String).filter(Boolean))];
  const { data: flags, error } = clean.length
    ? await admin.from("flags").select("id, clave").in("clave", clean)
    : { data: [], error: null };
  if (error) throw new ServiceError(error.message, 500);
  await admin.from("paquete_flags").delete().eq("paquete_id", packageId);
  if (flags?.length) {
    const { error: insertError } = await admin.from("paquete_flags").insert(
      flags.map((flag) => ({ paquete_id: packageId, flag_id: flag.id, activo: true })),
    );
    if (insertError) throw new ServiceError(insertError.message, 400);
  }
}

export async function deleteAccessPackage(actorId, empresaId, packageId) {
  const admin = await requireEmpresaAdmin(actorId, empresaId);
  const { data: pack } = await admin
    .from("paquetes_acceso")
    .select("id, es_sistema")
    .eq("id", packageId)
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (!pack) throw new ServiceError("Paquete no encontrado.", 404);
  if (pack.es_sistema) throw new ServiceError("Un paquete de sistema no puede eliminarse.", 403);
  const { error } = await admin.from("paquetes_acceso").delete().eq("id", packageId);
  if (error?.code === "23503") throw new ServiceError("El paquete está asignado a puestos.", 409);
  if (error) throw new ServiceError(error.message, 400);
  return { ok: true };
}

export async function assignWorkspaceRole(actorId, workspaceId, userId, roleId) {
  const admin = adminClient();
  const empresaId = await empresaFromWorkspace(admin, workspaceId);
  await requireEmpresaAdmin(actorId, empresaId);
  const { data: role } = await admin
    .from("roles")
    .select("id, slug")
    .eq("id", roleId)
    .eq("empresa_id", empresaId)
    .eq("scope", "workspace")
    .maybeSingle();
  if (!role) throw new ServiceError("El puesto no pertenece a esta empresa.", 400);
  const { data, error } = await admin
    .from("workspace_miembros")
    .update({
      role_id: roleId,
      rol_en_workspace: role.slug === "gerente" ? "gerente" : "vendedor",
    })
    .eq("workspace_id", workspaceId)
    .eq("usuario_id", userId)
    .select("workspace_id, usuario_id, role_id, rol_en_workspace")
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 400);
  return assertFound(data, "Miembro no encontrado.");
}

export async function assignEmpresaRole(actorId, empresaId, userId, roleId) {
  const admin = await requireEmpresaAdmin(actorId, empresaId);
  const { data: role } = await admin
    .from("roles")
    .select("id")
    .eq("id", roleId)
    .eq("empresa_id", empresaId)
    .eq("scope", "empresa")
    .maybeSingle();
  if (!role) throw new ServiceError("El rol administrativo no pertenece a esta empresa.", 400);
  const { data, error } = await admin
    .from("empresa_miembros")
    .update({ role_id: roleId })
    .eq("empresa_id", empresaId)
    .eq("usuario_id", userId)
    .select("empresa_id, usuario_id, role_id, es_admin, estado")
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 400);
  return assertFound(data, "Administrador de empresa no encontrado.");
}
