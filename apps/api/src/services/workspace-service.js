import { ServiceError, assertFound } from "../lib/service-error.js";
import { createServiceSupabaseClient } from "../lib/supabase-server.js";
import { isSuperAdmin } from "@salesapp/shared/auth/permissions.js";

export const CROSS_BOUNDARY_MSG =
  "No puedes mover información entre tu espacio personal y el de la empresa";

const SALETSE_DEFAULT_BRAND = {
  primary: "#1e5eff",
  accent: "#0f2044",
  logo_url: null,
  nombre: "Saletse",
};

function flagsMissing(error) {
  if (!error) return false;
  const msg = String(error.message || "");
  return (
    error.code === "PGRST205"
    || error.code === "42P01"
    || msg.includes("does not exist")
    || msg.includes("schema cache")
  );
}

function resolveBrand(workspace, empresa) {
  if (!workspace || workspace.tipo === "personal") {
    return { ...SALETSE_DEFAULT_BRAND };
  }
  const empColors = empresa?.colores_marca && typeof empresa.colores_marca === "object"
    ? empresa.colores_marca
    : {};
  const wsColors = workspace.colores_marca && typeof workspace.colores_marca === "object"
    ? workspace.colores_marca
    : {};
  return {
    primary: wsColors.primary || empColors.primary || SALETSE_DEFAULT_BRAND.primary,
    accent: wsColors.accent || empColors.accent || SALETSE_DEFAULT_BRAND.accent,
    logo_url: workspace.logo_url || empresa?.logo_url || null,
    nombre: workspace.nombre || empresa?.nombre || SALETSE_DEFAULT_BRAND.nombre,
    colores_marca: { ...empColors, ...wsColors },
  };
}

export async function ensurePersonalWorkspace(supabase, userId) {
  const { data, error } = await supabase.rpc("ensure_personal_workspace", {
    p_usuario_id: userId,
  });
  if (error) {
    if (flagsMissing(error)) return null;
    throw new ServiceError(error.message, 500);
  }
  return data;
}

export async function listUserWorkspaces(supabase, userId) {
  try {
    await ensurePersonalWorkspace(supabase, userId);
  } catch {
    /* migración no aplicada */
  }

  const { data: memberships, error } = await supabase
    .from("workspace_miembros")
    .select("rol_en_workspace, fecha_union, workspace_id, workspaces(id, tipo, nombre, logo_url, colores_marca, empresa_id, estado, empresas(id, nombre, logo_url, colores_marca))")
    .eq("usuario_id", userId);
  if (error) {
    if (flagsMissing(error)) return [];
    throw new ServiceError(error.message, 500);
  }

  return (memberships || [])
    .filter((m) => m.workspaces && m.workspaces.estado !== "archivado")
    .map((m) => {
      const w = m.workspaces;
      const emp = w.empresas || null;
      const brand = resolveBrand(w, emp);
      return {
        id: w.id,
        tipo: w.tipo,
        nombre: w.nombre,
        logo_url: brand.logo_url,
        empresa_id: w.empresa_id,
        empresa_nombre: emp?.nombre ?? null,
        rol_en_workspace: m.rol_en_workspace,
        fecha_union: m.fecha_union,
        brand,
      };
    })
    .sort((a, b) => {
      if (a.tipo === "personal" && b.tipo !== "personal") return -1;
      if (b.tipo === "personal" && a.tipo !== "personal") return 1;
      return String(a.nombre).localeCompare(String(b.nombre));
    });
}

export async function resolveActiveWorkspaceId(supabase, userId, preferredId = null) {
  const list = await listUserWorkspaces(supabase, userId);
  if (!list.length) return null;

  if (preferredId && list.some((w) => w.id === preferredId)) return preferredId;

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_activo_id")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.workspace_activo_id && list.some((w) => w.id === profile.workspace_activo_id)) {
    return profile.workspace_activo_id;
  }

  const personal = list.find((w) => w.tipo === "personal");
  return personal?.id || list[0].id;
}

export async function setActiveWorkspace(supabase, userId, workspaceId) {
  if (!workspaceId) throw new ServiceError("workspace_id requerido.");
  const { data: ok, error } = await supabase.rpc("user_in_workspace", {
    p_usuario_id: userId,
    p_workspace_id: workspaceId,
  });
  if (error) {
    if (flagsMissing(error)) throw new ServiceError("Workspaces no disponibles (aplica migración 0052).", 503);
    throw new ServiceError(error.message, 500);
  }
  if (ok !== true) throw new ServiceError("No perteneces a ese workspace.", 403);

  const { error: upErr } = await supabase
    .from("profiles")
    .update({ workspace_activo_id: workspaceId })
    .eq("id", userId);
  if (upErr) throw new ServiceError(upErr.message, 400);
  return workspaceId;
}

export async function assertWorkspaceBoundary(supabase, srcWorkspaceId, dstWorkspaceId) {
  if (!srcWorkspaceId || !dstWorkspaceId) {
    throw new ServiceError(CROSS_BOUNDARY_MSG, 403);
  }
  if (srcWorkspaceId === dstWorkspaceId) return true;
  const { data, error } = await supabase.rpc("workspace_boundary_ok", {
    p_src: srcWorkspaceId,
    p_dst: dstWorkspaceId,
  });
  if (error) {
    if (flagsMissing(error)) throw new ServiceError("Workspaces no disponibles (aplica migración 0052).", 503);
    throw new ServiceError(error.message, 500);
  }
  if (data !== true) throw new ServiceError(CROSS_BOUNDARY_MSG, 403);
  return true;
}

export async function userInWorkspace(supabase, userId, workspaceId) {
  const { data, error } = await supabase.rpc("user_in_workspace", {
    p_usuario_id: userId,
    p_workspace_id: workspaceId,
  });
  if (error) {
    if (flagsMissing(error)) return false;
    throw new ServiceError(error.message, 500);
  }
  return data === true;
}

/** Admin CRUD — Superadmin */
export async function listEmpresas(adminProfile) {
  if (!isSuperAdmin(adminProfile)) throw new ServiceError("Solo Superadmin.", 403);
  const admin = createServiceSupabaseClient();
  if (!admin) throw new ServiceError("Service role no configurado.", 500);
  const { data, error } = await admin
    .from("empresas")
    .select("id, nombre, logo_url, colores_marca, plan_paquete, estado, created_at")
    .order("nombre");
  if (error) throw new ServiceError(error.message, 500);
  return data ?? [];
}

export async function createEmpresa(adminProfile, body) {
  if (!isSuperAdmin(adminProfile)) throw new ServiceError("Solo Superadmin.", 403);
  const admin = createServiceSupabaseClient();
  if (!admin) throw new ServiceError("Service role no configurado.", 500);
  const nombre = String(body?.nombre || "").trim();
  if (!nombre) throw new ServiceError("nombre requerido.");
  const { data, error } = await admin
    .from("empresas")
    .insert({
      nombre,
      logo_url: body.logo_url || null,
      colores_marca: body.colores_marca && typeof body.colores_marca === "object" ? body.colores_marca : {},
      plan_paquete: body.plan_paquete || null,
      estado: body.estado || "activa",
    })
    .select()
    .single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function updateEmpresa(adminProfile, id, body) {
  if (!isSuperAdmin(adminProfile)) throw new ServiceError("Solo Superadmin.", 403);
  const admin = createServiceSupabaseClient();
  if (!admin) throw new ServiceError("Service role no configurado.", 500);
  const patch = { updated_at: new Date().toISOString() };
  if (body.nombre != null) patch.nombre = String(body.nombre).trim();
  if (body.logo_url !== undefined) patch.logo_url = body.logo_url || null;
  if (body.colores_marca !== undefined) patch.colores_marca = body.colores_marca || {};
  if (body.plan_paquete !== undefined) patch.plan_paquete = body.plan_paquete;
  if (body.estado != null) patch.estado = body.estado;
  const { data, error } = await admin.from("empresas").update(patch).eq("id", id).select().maybeSingle();
  if (error) throw new ServiceError(error.message, 400);
  return assertFound(data, "Empresa no encontrada.");
}

export async function createSala(adminProfile, body) {
  if (!isSuperAdmin(adminProfile)) throw new ServiceError("Solo Superadmin.", 403);
  const admin = createServiceSupabaseClient();
  if (!admin) throw new ServiceError("Service role no configurado.", 500);
  const empresaId = body?.empresa_id;
  const nombre = String(body?.nombre || "").trim();
  const gerenteId = body?.gerente_id;
  if (!empresaId || !nombre) throw new ServiceError("empresa_id y nombre requeridos.");
  if (!gerenteId) throw new ServiceError("gerente_id requerido (1 gerente por sala).");

  const { data: ws, error } = await admin
    .from("workspaces")
    .insert({
      tipo: "sala_de_venta",
      empresa_id: empresaId,
      nombre,
      logo_url: body.logo_url || null,
      colores_marca: body.colores_marca && typeof body.colores_marca === "object" ? body.colores_marca : {},
    })
    .select()
    .single();
  if (error) throw new ServiceError(error.message, 400);

  const { error: memErr } = await admin.from("workspace_miembros").insert({
    usuario_id: gerenteId,
    workspace_id: ws.id,
    rol_en_workspace: "gerente",
  });
  if (memErr) {
    await admin.from("workspaces").delete().eq("id", ws.id);
    throw new ServiceError(memErr.message, 400);
  }
  return ws;
}

export async function updateSala(adminProfile, id, body) {
  if (!isSuperAdmin(adminProfile)) throw new ServiceError("Solo Superadmin.", 403);
  const admin = createServiceSupabaseClient();
  if (!admin) throw new ServiceError("Service role no configurado.", 500);
  const patch = { updated_at: new Date().toISOString() };
  if (body.nombre != null) patch.nombre = String(body.nombre).trim();
  if (body.logo_url !== undefined) patch.logo_url = body.logo_url || null;
  if (body.colores_marca !== undefined) patch.colores_marca = body.colores_marca || {};
  if (body.estado != null) patch.estado = body.estado;
  const { data, error } = await admin
    .from("workspaces")
    .update(patch)
    .eq("id", id)
    .eq("tipo", "sala_de_venta")
    .select()
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 400);
  return assertFound(data, "Sala no encontrada.");
}

export async function listSalas(adminProfile, empresaId = null) {
  if (!isSuperAdmin(adminProfile)) throw new ServiceError("Solo Superadmin.", 403);
  const admin = createServiceSupabaseClient();
  if (!admin) throw new ServiceError("Service role no configurado.", 500);
  let q = admin
    .from("workspaces")
    .select("id, tipo, nombre, logo_url, colores_marca, empresa_id, estado, created_at, workspace_miembros(usuario_id, rol_en_workspace)")
    .eq("tipo", "sala_de_venta")
    .order("nombre");
  if (empresaId) q = q.eq("empresa_id", empresaId);
  const { data, error } = await q;
  if (error) throw new ServiceError(error.message, 500);
  return data ?? [];
}

export async function addSalaMember(adminProfile, workspaceId, { usuario_id, rol_en_workspace = "vendedor" }) {
  if (!isSuperAdmin(adminProfile)) throw new ServiceError("Solo Superadmin.", 403);
  const admin = createServiceSupabaseClient();
  if (!admin) throw new ServiceError("Service role no configurado.", 500);
  if (!usuario_id) throw new ServiceError("usuario_id requerido.");
  const rol = rol_en_workspace === "gerente" ? "gerente" : "vendedor";
  const { data, error } = await admin
    .from("workspace_miembros")
    .upsert({
      usuario_id,
      workspace_id: workspaceId,
      rol_en_workspace: rol,
    }, { onConflict: "usuario_id,workspace_id" })
    .select()
    .single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function removeSalaMember(adminProfile, workspaceId, usuarioId) {
  if (!isSuperAdmin(adminProfile)) throw new ServiceError("Solo Superadmin.", 403);
  const admin = createServiceSupabaseClient();
  if (!admin) throw new ServiceError("Service role no configurado.", 500);
  const { error } = await admin
    .from("workspace_miembros")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("usuario_id", usuarioId);
  if (error) throw new ServiceError(error.message, 400);
  // Si era workspace activo, caer a personal
  const { data: profile } = await admin
    .from("profiles")
    .select("workspace_activo_id")
    .eq("id", usuarioId)
    .maybeSingle();
  if (profile?.workspace_activo_id === workspaceId) {
    const personal = await ensurePersonalWorkspace(admin, usuarioId);
    await admin.from("profiles").update({ workspace_activo_id: personal }).eq("id", usuarioId);
  }
  return { ok: true };
}
