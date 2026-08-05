import { ServiceError } from "../lib/service-error.js";
import { adminClient, requireEmpresaAdmin } from "../lib/tenant-access.js";
import { persistBrandingLogo } from "./workspace-service.js";

export async function getHierarchicalAdminContext(userId) {
  const admin = adminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, role, role_id, is_super_admin, admin_permissions")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  if (!profile) return null;
  if (profile.is_super_admin === true) {
    return {
      scope: "plataforma",
      profile,
      empresa_ids: [],
      workspace_ids: [],
      permissions: [],
    };
  }

  const [{ data: empresas }, { data: salas }] = await Promise.all([
    admin
      .from("empresa_miembros")
      .select("empresa_id, role_id, es_admin, empresas(nombre, logo_url, colores_marca, plan_paquete)")
      .eq("usuario_id", userId)
      .eq("estado", "activo")
      .eq("es_admin", true),
    admin
      .from("workspace_miembros")
      .select("workspace_id, role_id, rol_en_workspace, workspaces(empresa_id, nombre, estado)")
      .eq("usuario_id", userId),
  ]);

  const companyMemberships = empresas ?? [];
  if (companyMemberships.length) {
    return {
      scope: "empresa",
      profile,
      empresa_ids: companyMemberships.map((row) => row.empresa_id),
      workspace_ids: (salas ?? [])
        .filter((row) => companyMemberships.some((em) => em.empresa_id === row.workspaces?.empresa_id))
        .map((row) => row.workspace_id),
      memberships: companyMemberships,
      permissions: [
        "ver_resumen",
        "gestionar_empresas",
      ],
    };
  }

  const managedRooms = (salas ?? []).filter(
    (row) => row.workspaces?.estado !== "archivado" && row.rol_en_workspace === "gerente",
  );
  if (managedRooms.length) {
    return {
      scope: "workspace",
      profile,
      empresa_ids: [...new Set(managedRooms.map((row) => row.workspaces?.empresa_id).filter(Boolean))],
      workspace_ids: managedRooms.map((row) => row.workspace_id),
      memberships: managedRooms,
      permissions: ["ver_resumen"],
    };
  }
  return null;
}

export async function listEmpresaAdmins(actorId, empresaId) {
  const admin = await requireEmpresaAdmin(actorId, empresaId);
  const { data, error } = await admin
    .from("empresa_miembros")
    .select("id, empresa_id, usuario_id, role_id, es_admin, estado, fecha_union, profiles(full_name, email, avatar_url), roles(nombre, slug)")
    .eq("empresa_id", empresaId)
    .eq("estado", "activo")
    .order("fecha_union");
  if (error) throw new ServiceError(error.message, 500);
  // Admins reales + Asistentes de Empresa (delegados).
  return (data ?? []).filter((row) =>
    row.es_admin === true || row.roles?.slug === "asistente_empresa");
}

const SEARCH_MIN_CHARS = 2;
const SEARCH_MAX_CHARS = 80;
const SEARCH_RESULT_LIMIT = 10;

/**
 * Busca usuarios por nombre o correo para asignarlos dentro de la empresa.
 * Alcance: solo usuarios de esta empresa o sin organización asignada;
 * nunca expone usuarios que pertenecen a otra empresa.
 */
export async function searchAssignableUsers(actorId, empresaId, rawQuery) {
  const admin = await requireEmpresaAdmin(actorId, empresaId);
  const query = String(rawQuery || "").trim().replace(/[,%()\\]/g, "");
  if (query.length < SEARCH_MIN_CHARS) return [];
  if (query.length > SEARCH_MAX_CHARS) throw new ServiceError("Búsqueda demasiado larga.", 400);

  const { data: matches, error } = await admin
    .from("profiles")
    .select("id, full_name, email, avatar_url")
    .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
    .order("full_name")
    .limit(30);
  if (error) throw new ServiceError(error.message, 500);
  if (!matches?.length) return [];

  const ids = matches.map((profile) => profile.id);
  const [{ data: salaMemberships }, { data: companyMemberships }] = await Promise.all([
    admin
      .from("workspace_miembros")
      .select("usuario_id, workspaces(empresa_id, tipo)")
      .in("usuario_id", ids),
    admin
      .from("empresa_miembros")
      .select("usuario_id, empresa_id")
      .in("usuario_id", ids)
      .eq("estado", "activo"),
  ]);

  const empresasByUser = new Map();
  const track = (userId, empresa) => {
    if (!empresa) return;
    if (!empresasByUser.has(userId)) empresasByUser.set(userId, new Set());
    empresasByUser.get(userId).add(empresa);
  };
  for (const row of salaMemberships ?? []) {
    if (row.workspaces?.tipo === "sala_de_venta") track(row.usuario_id, row.workspaces.empresa_id);
  }
  for (const row of companyMemberships ?? []) track(row.usuario_id, row.empresa_id);

  return matches
    .filter((profile) => {
      const empresas = empresasByUser.get(profile.id);
      return !empresas || empresas.has(empresaId);
    })
    .slice(0, SEARCH_RESULT_LIMIT)
    .map((profile) => ({
      id: profile.id,
      full_name: profile.full_name || null,
      email: profile.email || null,
      avatar_url: profile.avatar_url || null,
      en_empresa: empresasByUser.get(profile.id)?.has(empresaId) === true,
    }));
}

export async function upsertEmpresaAdmin(actorId, empresaId, body) {
  const admin = await requireEmpresaAdmin(actorId, empresaId);
  let userId = body?.usuario_id ?? body?.user_id ?? null;
  if (!userId && body?.email) {
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", String(body.email).trim())
      .maybeSingle();
    userId = profile?.id ?? null;
  }
  if (!userId) throw new ServiceError("Usuario no encontrado.", 404);

  let roleSlug = null;
  if (body?.role_id) {
    const { data: role } = await admin
      .from("roles")
      .select("id, slug")
      .eq("id", body.role_id)
      .eq("empresa_id", empresaId)
      .eq("scope", "empresa")
      .maybeSingle();
    if (!role) throw new ServiceError("Rol administrativo inválido.", 400);
    roleSlug = role.slug;
  }

  // Asistente de Empresa: sin es_admin (acceso solo vía permisos_delegados).
  const esAdmin = roleSlug === "asistente_empresa"
    ? false
    : body?.es_admin !== false;

  const { data, error } = await admin
    .from("empresa_miembros")
    .upsert({
      empresa_id: empresaId,
      usuario_id: userId,
      role_id: body?.role_id || null,
      es_admin: esAdmin,
      estado: "activo",
    }, { onConflict: "empresa_id,usuario_id" })
    .select("id, empresa_id, usuario_id, role_id, es_admin, estado, fecha_union")
    .single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function removeEmpresaAdmin(actorId, empresaId, userId) {
  const admin = await requireEmpresaAdmin(actorId, empresaId);
  const { count } = await admin
    .from("empresa_miembros")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId)
    .eq("es_admin", true)
    .eq("estado", "activo");
  if ((count ?? 0) <= 1) {
    throw new ServiceError("La empresa debe conservar al menos un administrador.", 409);
  }
  const { error, count: removed } = await admin
    .from("empresa_miembros")
    .delete({ count: "exact" })
    .eq("empresa_id", empresaId)
    .eq("usuario_id", userId);
  if (error) throw new ServiceError(error.message, 400);
  if (!removed) throw new ServiceError("Administrador no encontrado.", 404);
  return { ok: true };
}

export async function listScopedSalas(actorId, empresaId) {
  const admin = await requireEmpresaAdmin(actorId, empresaId);
  const { data, error } = await admin
    .from("workspaces")
    .select("id, empresa_id, nombre, logo_url, colores_marca, estado, created_at, workspace_miembros(usuario_id, role_id, rol_en_workspace, profiles(full_name, email), roles(nombre, slug))")
    .eq("empresa_id", empresaId)
    .eq("tipo", "sala_de_venta")
    .order("nombre");
  if (error) throw new ServiceError(error.message, 500);
  return data ?? [];
}

export async function updateScopedEmpresa(actorId, empresaId, body) {
  const admin = await requireEmpresaAdmin(actorId, empresaId);
  const patch = { updated_at: new Date().toISOString() };
  if (body?.nombre !== undefined) patch.nombre = String(body.nombre).trim();
  if (body?.logo_url !== undefined) {
    patch.logo_url = await persistBrandingLogo(admin, {
      tipo: "empresa",
      id: empresaId,
      logoUrl: body.logo_url,
    });
  }
  if (body?.colores_marca !== undefined) patch.colores_marca = body.colores_marca || {};
  if (body?.plan_paquete !== undefined) patch.plan_paquete = body.plan_paquete || null;
  const { data, error } = await admin
    .from("empresas")
    .update(patch)
    .eq("id", empresaId)
    .select("id, nombre, logo_url, colores_marca, plan_paquete, estado")
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 400);
  if (!data) throw new ServiceError("Empresa no encontrada.", 404);
  return data;
}

/** Sube logo de empresa (Admin empresa o Superadmin) desde data URL. */
export async function uploadScopedEmpresaLogo(actorId, empresaId, dataUrl) {
  const admin = await requireEmpresaAdmin(actorId, empresaId);
  if (!dataUrl) throw new ServiceError("data_url requerido.", 400);
  const logoUrl = await persistBrandingLogo(admin, {
    tipo: "empresa",
    id: empresaId,
    logoUrl: dataUrl,
  });
  const { data, error } = await admin
    .from("empresas")
    .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
    .eq("id", empresaId)
    .select("id, nombre, logo_url, colores_marca, plan_paquete, estado")
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 400);
  if (!data) throw new ServiceError("Empresa no encontrada.", 404);
  return data;
}

export async function createScopedSala(actorId, empresaId, body) {
  const admin = await requireEmpresaAdmin(actorId, empresaId);
  const nombre = String(body?.nombre || "").trim();
  let gerenteId = body?.gerente_id ?? body?.gerenteId;
  if (!gerenteId && body?.gerente_email) {
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", String(body.gerente_email).trim())
      .maybeSingle();
    gerenteId = profile?.id ?? null;
  }
  if (!nombre || !gerenteId) throw new ServiceError("Nombre y gerente válido son requeridos.", 400);

  const { data: manager } = await admin
    .from("profiles")
    .select("id")
    .eq("id", gerenteId)
    .maybeSingle();
  if (!manager) throw new ServiceError("Gerente no encontrado.", 404);

  const { ensureEmpresaOperationalRoles } = await import("./empresa-roles-seed.js");
  await ensureEmpresaOperationalRoles(admin, empresaId);

  const { data: room, error } = await admin
    .from("workspaces")
    .insert({
      empresa_id: empresaId,
      tipo: "sala_de_venta",
      nombre,
      logo_url: body?.logo_url || null,
      colores_marca: body?.colores_marca || {},
      estado: "activo",
    })
    .select("id, empresa_id, nombre, estado")
    .single();
  if (error) throw new ServiceError(error.message, 400);

  const { data: managerRole } = await admin
    .from("roles")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("scope", "workspace")
    .eq("slug", "gerente")
    .maybeSingle();
  const { error: memberError } = await admin.from("workspace_miembros").insert({
    workspace_id: room.id,
    usuario_id: gerenteId,
    role_id: managerRole?.id || null,
    rol_en_workspace: "gerente",
  });
  if (memberError) {
    await admin.from("workspaces").delete().eq("id", room.id);
    throw new ServiceError(memberError.message, 400);
  }
  return room;
}

export async function setScopedSalaGerente(actorId, workspaceId, userId) {
  const admin = adminClient();
  const { data: room } = await admin
    .from("workspaces")
    .select("id, empresa_id")
    .eq("id", workspaceId)
    .eq("tipo", "sala_de_venta")
    .maybeSingle();
  if (!room) throw new ServiceError("Sala no encontrada.", 404);
  await requireEmpresaAdmin(actorId, room.empresa_id);

  const { data: managerRole } = await admin
    .from("roles")
    .select("id")
    .eq("empresa_id", room.empresa_id)
    .eq("scope", "workspace")
    .eq("slug", "gerente")
    .maybeSingle();
  const { data: linerRole } = await admin
    .from("roles")
    .select("id")
    .eq("empresa_id", room.empresa_id)
    .eq("scope", "workspace")
    .eq("slug", "liner")
    .maybeSingle();

  await admin
    .from("workspace_miembros")
    .update({ rol_en_workspace: "vendedor", role_id: linerRole?.id || null })
    .eq("workspace_id", workspaceId)
    .eq("rol_en_workspace", "gerente");
  const { data, error } = await admin
    .from("workspace_miembros")
    .upsert({
      workspace_id: workspaceId,
      usuario_id: userId,
      role_id: managerRole?.id || null,
      rol_en_workspace: "gerente",
    }, { onConflict: "workspace_id,usuario_id" })
    .select("workspace_id, usuario_id, role_id, rol_en_workspace")
    .single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function addScopedSalaMember(actorId, workspaceId, body) {
  const admin = adminClient();
  const { data: room } = await admin
    .from("workspaces")
    .select("id, empresa_id")
    .eq("id", workspaceId)
    .eq("tipo", "sala_de_venta")
    .maybeSingle();
  if (!room) throw new ServiceError("Sala no encontrada.", 404);
  await requireEmpresaAdmin(actorId, room.empresa_id);

  let userId = body?.usuario_id ?? body?.user_id ?? null;
  if (!userId && body?.email) {
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", String(body.email).trim())
      .maybeSingle();
    userId = profile?.id ?? null;
  }
  if (!userId) throw new ServiceError("Usuario no encontrado.", 404);

  const roleId = body?.role_id || null;
  if (roleId) {
    const { data: role } = await admin
      .from("roles")
      .select("id, slug")
      .eq("id", roleId)
      .eq("empresa_id", room.empresa_id)
      .eq("scope", "workspace")
      .maybeSingle();
    if (!role) throw new ServiceError("Puesto inválido para esta empresa.", 400);
    if (role.slug === "gerente") {
      throw new ServiceError("Usa la acción Cambiar gerente para asignar este puesto.", 400);
    }
  }
  const { data, error } = await admin
    .from("workspace_miembros")
    .upsert({
      workspace_id: workspaceId,
      usuario_id: userId,
      role_id: roleId,
      rol_en_workspace: "vendedor",
    }, { onConflict: "workspace_id,usuario_id" })
    .select("workspace_id, usuario_id, role_id, rol_en_workspace")
    .single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function removeScopedSalaMember(actorId, workspaceId, userId) {
  const admin = adminClient();
  const { data: room } = await admin
    .from("workspaces")
    .select("id, empresa_id")
    .eq("id", workspaceId)
    .eq("tipo", "sala_de_venta")
    .maybeSingle();
  if (!room) throw new ServiceError("Sala no encontrada.", 404);
  await requireEmpresaAdmin(actorId, room.empresa_id);
  const { data: member } = await admin
    .from("workspace_miembros")
    .select("rol_en_workspace")
    .eq("workspace_id", workspaceId)
    .eq("usuario_id", userId)
    .maybeSingle();
  if (member?.rol_en_workspace === "gerente") {
    throw new ServiceError("Asigna otro gerente antes de retirar al gerente actual.", 409);
  }
  const { error, count } = await admin
    .from("workspace_miembros")
    .delete({ count: "exact" })
    .eq("workspace_id", workspaceId)
    .eq("usuario_id", userId);
  if (error) throw new ServiceError(error.message, 400);
  if (!count) throw new ServiceError("Miembro no encontrado.", 404);
  return { ok: true };
}

export async function getEmpresaOverview(actorId, empresaId) {
  const admin = await requireEmpresaAdmin(actorId, empresaId);
  const { data: rooms, error } = await admin
    .from("workspaces")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("tipo", "sala_de_venta")
    .neq("estado", "archivado");
  if (error) throw new ServiceError(error.message, 500);
  const workspaceIds = (rooms ?? []).map((room) => room.id);
  if (!workspaceIds.length) {
    return { empresas: 1, salas: 0, miembros: 0, expedientes: 0, ventas: 0 };
  }
  const [{ count: members }, { count: prospects }, { count: sales }] = await Promise.all([
    admin.from("workspace_miembros").select("usuario_id", { count: "exact", head: true }).in("workspace_id", workspaceIds),
    admin.from("prospects").select("id", { count: "exact", head: true }).in("workspace_id", workspaceIds),
    admin.from("sales").select("id", { count: "exact", head: true }).in("workspace_id", workspaceIds),
  ]);
  return {
    empresas: 1,
    salas: workspaceIds.length,
    miembros: members ?? 0,
    expedientes: prospects ?? 0,
    ventas: sales ?? 0,
  };
}

export async function getSalaOverview(actorId, workspaceId) {
  const context = await getHierarchicalAdminContext(actorId);
  if (!context?.workspace_ids?.includes(workspaceId) && context?.scope !== "plataforma") {
    throw new ServiceError("No puedes administrar esta sala.", 403);
  }
  const admin = adminClient();
  const [{ count: members }, { count: prospects }, { count: sales }] = await Promise.all([
    admin.from("workspace_miembros").select("usuario_id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    admin.from("prospects").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    admin.from("sales").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
  ]);
  return { salas: 1, miembros: members ?? 0, expedientes: prospects ?? 0, ventas: sales ?? 0 };
}
