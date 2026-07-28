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
  if (body.logo_url !== undefined) {
    patch.logo_url = await resolvePersistedLogoUrl(admin, {
      tipo: "empresa",
      id,
      logoUrl: body.logo_url,
    });
  }
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
  if (body.logo_url !== undefined) {
    patch.logo_url = await resolvePersistedLogoUrl(admin, {
      tipo: "sala",
      id,
      logoUrl: body.logo_url,
    });
  }
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

async function assertSoleGerenteSafe(admin, workspaceId, usuarioId) {
  const { data: row } = await admin
    .from("workspace_miembros")
    .select("rol_en_workspace")
    .eq("workspace_id", workspaceId)
    .eq("usuario_id", usuarioId)
    .maybeSingle();
  if (row?.rol_en_workspace !== "gerente") return;
  const { count, error } = await admin
    .from("workspace_miembros")
    .select("usuario_id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("rol_en_workspace", "gerente");
  if (error) throw new ServiceError(error.message, 500);
  if ((count ?? 0) <= 1) {
    throw new ServiceError("Asigna otro gerente primero antes de quitar o abandonar al único gerente.", 403);
  }
}

/** Swap atómico: demote gerentes actuales → vendedor, promote nuevo. */
export async function setSalaGerente(adminProfile, workspaceId, newGerenteId) {
  if (!isSuperAdmin(adminProfile)) throw new ServiceError("Solo Superadmin.", 403);
  const admin = createServiceSupabaseClient();
  if (!admin) throw new ServiceError("Service role no configurado.", 500);
  if (!newGerenteId) throw new ServiceError("usuario_id requerido.");

  const { data: ws } = await admin
    .from("workspaces")
    .select("id, tipo")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!ws || ws.tipo !== "sala_de_venta") throw new ServiceError("Sala no encontrada.", 404);

  const { data: existing } = await admin
    .from("workspace_miembros")
    .select("usuario_id, rol_en_workspace")
    .eq("workspace_id", workspaceId);
  const members = existing || [];
  const already = members.find((m) => m.usuario_id === newGerenteId);
  if (already?.rol_en_workspace === "gerente") return already;

  const currentGerentes = members.filter((m) => m.rol_en_workspace === "gerente");
  for (const g of currentGerentes) {
    const { error: demoteErr } = await admin
      .from("workspace_miembros")
      .update({ rol_en_workspace: "vendedor" })
      .eq("workspace_id", workspaceId)
      .eq("usuario_id", g.usuario_id);
    if (demoteErr) throw new ServiceError(demoteErr.message, 400);
  }

  const { data, error } = await admin
    .from("workspace_miembros")
    .upsert({
      usuario_id: newGerenteId,
      workspace_id: workspaceId,
      rol_en_workspace: "gerente",
    }, { onConflict: "usuario_id,workspace_id" })
    .select()
    .single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function addSalaMember(adminProfile, workspaceId, { usuario_id, rol_en_workspace = "vendedor" }) {
  if (!isSuperAdmin(adminProfile)) throw new ServiceError("Solo Superadmin.", 403);
  if (!usuario_id) throw new ServiceError("usuario_id requerido.");
  const rol = rol_en_workspace === "gerente" ? "gerente" : "vendedor";
  if (rol === "gerente") {
    return setSalaGerente(adminProfile, workspaceId, usuario_id);
  }
  const admin = createServiceSupabaseClient();
  if (!admin) throw new ServiceError("Service role no configurado.", 500);
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
  await assertSoleGerenteSafe(admin, workspaceId, usuarioId);
  const { error } = await admin
    .from("workspace_miembros")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("usuario_id", usuarioId);
  if (error) throw new ServiceError(error.message, 400);
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

async function requireActiveSalaGerente(supabase, userId) {
  const list = await listUserWorkspaces(supabase, userId);
  const workspaceId = await resolveActiveWorkspaceId(supabase, userId);
  const active = list.find((w) => w.id === workspaceId) || null;
  if (!active || active.tipo !== "sala_de_venta") {
    throw new ServiceError("Solo disponible en una sala de venta activa.", 403);
  }
  if (active.rol_en_workspace !== "gerente") {
    throw new ServiceError("Solo el gerente puede gestionar el equipo.", 403);
  }
  return active;
}

export async function listTeamMembers(supabase, userId) {
  const active = await requireActiveSalaGerente(supabase, userId);
  return listSalaMembersInternal(active.id, userId);
}

/** Miembros de la sala activa (cualquier rol) para chat colaborativo 1:1. */
export async function listSalaPeers(supabase, userId) {
  const list = await listUserWorkspaces(supabase, userId);
  const workspaceId = await resolveActiveWorkspaceId(supabase, userId);
  const active = list.find((w) => w.id === workspaceId) || null;
  if (!active || active.tipo !== "sala_de_venta") {
    throw new ServiceError("Solo disponible en una sala de venta activa.", 403);
  }
  return listSalaMembersInternal(active.id, userId);
}

async function listSalaMembersInternal(workspaceId, excludeUserId = null) {
  const admin = createServiceSupabaseClient();
  if (!admin) throw new ServiceError("Service role no configurado.", 500);
  const { data, error } = await admin
    .from("workspace_miembros")
    .select("usuario_id, rol_en_workspace, fecha_union")
    .eq("workspace_id", workspaceId)
    .order("fecha_union", { ascending: true });
  if (error) throw new ServiceError(error.message, 500);
  const ids = (data || []).map((m) => m.usuario_id);
  let profilesById = new Map();
  if (ids.length) {
    const { data: profiles, error: pErr } = await admin
      .from("profiles")
      .select("id, email, full_name, avatar_url")
      .in("id", ids);
    if (pErr) throw new ServiceError(pErr.message, 500);
    profilesById = new Map((profiles || []).map((p) => [p.id, p]));
  }
  return (data || [])
    .filter((m) => !excludeUserId || m.usuario_id !== excludeUserId)
    .map((m) => {
      const p = profilesById.get(m.usuario_id);
      return {
        id: m.usuario_id,
        rol_en_workspace: m.rol_en_workspace,
        fecha_union: m.fecha_union,
        email: p?.email ?? null,
        full_name: p?.full_name ?? null,
        avatar_url: p?.avatar_url ?? null,
      };
    });
}

export async function listTeamProspects(supabase, userId, { memberId = null, limit = 50, offset = 0 } = {}) {
  const active = await requireActiveSalaGerente(supabase, userId);
  let q = supabase
    .from("prospects")
    .select("id, user_id, prospect_code, name, name1, name2, status, tipo_tour, tour_date, created_at, email, phone, city, country", { count: "exact" })
    .eq("workspace_id", active.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (memberId) q = q.eq("user_id", memberId);
  const { data, error, count } = await q;
  if (error) throw new ServiceError(error.message, 500);
  return { data: data ?? [], total: count ?? 0, limit, offset, workspace_id: active.id };
}

export async function inviteToActiveSala(supabase, userId, { email } = {}) {
  const active = await requireActiveSalaGerente(supabase, userId);
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    throw new ServiceError("Email inválido.");
  }
  const admin = createServiceSupabaseClient();
  if (!admin) throw new ServiceError("Service role no configurado.", 500);

  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .ilike("email", normalized)
    .maybeSingle();
  if (pErr) throw new ServiceError(pErr.message, 500);
  if (!profile) {
    throw new ServiceError("Ese email no tiene cuenta. Debe crear una cuenta en Saletse primero.", 404);
  }
  if (profile.id === userId) {
    throw new ServiceError("No puedes invitarte a ti mismo.");
  }

  const { data: otherSalas, error: oErr } = await admin
    .from("workspace_miembros")
    .select("workspace_id, workspaces!inner(id, tipo, nombre)")
    .eq("usuario_id", profile.id)
    .neq("workspace_id", active.id);
  if (oErr) throw new ServiceError(oErr.message, 500);
  const otherSala = (otherSalas || []).find((m) => m.workspaces?.tipo === "sala_de_venta");
  if (otherSala) {
    throw new ServiceError(
      `Ese usuario ya pertenece a otra sala (${otherSala.workspaces?.nombre || "sala"}). Debe salir primero.`,
      403,
    );
  }

  const { data: existing } = await admin
    .from("workspace_miembros")
    .select("usuario_id, rol_en_workspace")
    .eq("workspace_id", active.id)
    .eq("usuario_id", profile.id)
    .maybeSingle();
  if (existing) {
    return {
      ok: true,
      already_member: true,
      member: {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        rol_en_workspace: existing.rol_en_workspace,
      },
    };
  }

  const { data: member, error: mErr } = await admin
    .from("workspace_miembros")
    .insert({
      usuario_id: profile.id,
      workspace_id: active.id,
      rol_en_workspace: "vendedor",
    })
    .select()
    .single();
  if (mErr) throw new ServiceError(mErr.message, 400);

  return {
    ok: true,
    already_member: false,
    member: {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      rol_en_workspace: member.rol_en_workspace,
    },
    workspace: { id: active.id, nombre: active.nombre },
    inviter: { id: userId },
  };
}

export async function leaveActiveSala(supabase, userId) {
  const list = await listUserWorkspaces(supabase, userId);
  const workspaceId = await resolveActiveWorkspaceId(supabase, userId);
  const active = list.find((w) => w.id === workspaceId) || null;
  if (!active || active.tipo !== "sala_de_venta") {
    throw new ServiceError("Solo puedes abandonar una sala de venta (no el espacio personal).", 403);
  }
  const admin = createServiceSupabaseClient();
  if (!admin) throw new ServiceError("Service role no configurado.", 500);
  await assertSoleGerenteSafe(admin, active.id, userId);

  const { error } = await admin
    .from("workspace_miembros")
    .delete()
    .eq("workspace_id", active.id)
    .eq("usuario_id", userId);
  if (error) throw new ServiceError(error.message, 400);

  const personal = await ensurePersonalWorkspace(admin, userId);
  await admin.from("profiles").update({ workspace_activo_id: personal }).eq("id", userId);
  return { ok: true, workspace_activo_id: personal };
}

export async function listSalaMembersDetailed(adminProfile, workspaceId) {
  if (!isSuperAdmin(adminProfile)) throw new ServiceError("Solo Superadmin.", 403);
  const admin = createServiceSupabaseClient();
  if (!admin) throw new ServiceError("Service role no configurado.", 500);
  const { data, error } = await admin
    .from("workspace_miembros")
    .select("usuario_id, rol_en_workspace, fecha_union")
    .eq("workspace_id", workspaceId)
    .order("fecha_union", { ascending: true });
  if (error) throw new ServiceError(error.message, 500);
  const ids = (data || []).map((m) => m.usuario_id);
  let profilesById = new Map();
  if (ids.length) {
    const { data: profiles, error: pErr } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .in("id", ids);
    if (pErr) throw new ServiceError(pErr.message, 500);
    profilesById = new Map((profiles || []).map((p) => [p.id, p]));
  }
  return (data || []).map((m) => {
    const p = profilesById.get(m.usuario_id);
    return {
      id: m.usuario_id,
      rol_en_workspace: m.rol_en_workspace,
      fecha_union: m.fecha_union,
      email: p?.email ?? null,
      full_name: p?.full_name ?? null,
    };
  });
}

const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

function logoExtForMime(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

function normalizeLogoMime(mime) {
  const m = String(mime || "").toLowerCase().split(";")[0].trim();
  if (m === "image/jpg") return "image/jpeg";
  return m;
}

function isOurBrandingUrl(url) {
  return /\/storage\/v1\/object\/public\/workspace-branding\//i.test(String(url || ""));
}

async function uploadLogoBuffer(admin, { tipo, id, buffer, mime }) {
  const contentType = normalizeLogoMime(mime);
  if (!LOGO_MIME.has(contentType)) {
    throw new ServiceError("Formato de logo no soportado. Usa PNG, JPG o WEBP.", 400);
  }
  if (!buffer?.length || buffer.length > LOGO_MAX_BYTES) {
    throw new ServiceError("El logo supera el máximo de 2 MB.", 400);
  }
  const ext = logoExtForMime(contentType);
  const path = `${tipo}/${id}/${Date.now()}.${ext}`;
  const { error: upErr } = await admin.storage
    .from("workspace-branding")
    .upload(path, buffer, { contentType, upsert: true });
  if (upErr) {
    const msg = upErr.message || "No se pudo subir el logo.";
    if (/bucket|not found|does not exist/i.test(msg)) {
      throw new ServiceError(
        "Bucket workspace-branding no existe. Aplica la migración 0053 en Supabase.",
        503,
      );
    }
    throw new ServiceError(msg, 400);
  }
  const { data: pub } = admin.storage.from("workspace-branding").getPublicUrl(path);
  const logoUrl = pub?.publicUrl || null;
  if (!logoUrl) throw new ServiceError("No se pudo resolver la URL pública del logo.", 500);
  return logoUrl;
}

/**
 * Persiste logo: null limpia; URL propia se deja; URL externa se descarga y se re-hospeda
 * en Storage (evita hotlink / URLs no directas rotas en el rail).
 */
async function resolvePersistedLogoUrl(admin, { tipo, id, logoUrl }) {
  if (logoUrl == null || logoUrl === "") return null;
  const url = String(logoUrl).trim();
  if (!url) return null;
  if (isOurBrandingUrl(url)) return url;

  if (/^data:image\//i.test(url)) {
    const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i.exec(url);
    if (!match) throw new ServiceError("Imagen inválida. Usa PNG, JPG o WEBP.", 400);
    const mime = normalizeLogoMime(match[1]);
    const buffer = Buffer.from(match[2], "base64");
    return uploadLogoBuffer(admin, { tipo, id, buffer, mime });
  }

  if (!/^https?:\/\//i.test(url)) {
    throw new ServiceError("La URL del logo debe ser http(s) directa a la imagen.", 400);
  }

  let res;
  try {
    res = await fetch(url, {
      redirect: "follow",
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "User-Agent": "SaletseBranding/1.0 (+https://saletse.app)",
      },
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    throw new ServiceError(
      `No se pudo descargar el logo desde esa URL (${err instanceof Error ? err.message : "error de red"}). Usa una URL directa (.png/.jpg) o súbelo como archivo.`,
      400,
    );
  }
  if (!res.ok) {
    throw new ServiceError(
      `No se pudo descargar el logo (HTTP ${res.status}). Usa una URL directa a la imagen o súbelo como archivo.`,
      400,
    );
  }
  const mime = normalizeLogoMime(res.headers.get("content-type") || "");
  if (!LOGO_MIME.has(mime) && mime !== "image/jpeg") {
    // Algunos CDN no mandan content-type; mirar extensión
    const byExt = /\.(png)(?:\?|$)/i.test(url)
      ? "image/png"
      : /\.(webp)(?:\?|$)/i.test(url)
        ? "image/webp"
        : /\.(jpe?g)(?:\?|$)/i.test(url)
          ? "image/jpeg"
          : null;
    if (!byExt) {
      throw new ServiceError(
        "La URL no apunta a una imagen PNG/JPG/WEBP. Abre la imagen en una pestaña, copia esa URL, o súbela como archivo.",
        400,
      );
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return uploadLogoBuffer(admin, { tipo, id, buffer, mime: byExt });
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return uploadLogoBuffer(admin, { tipo, id, buffer, mime });
}

export async function uploadWorkspaceLogo(adminProfile, { tipo, id, dataUrl }) {
  if (!isSuperAdmin(adminProfile)) throw new ServiceError("Solo Superadmin.", 403);
  const admin = createServiceSupabaseClient();
  if (!admin) throw new ServiceError("Service role no configurado.", 500);
  if (!id || (tipo !== "empresa" && tipo !== "sala")) {
    throw new ServiceError("tipo y id requeridos.");
  }
  const logoUrl = await resolvePersistedLogoUrl(admin, { tipo, id, logoUrl: dataUrl });
  if (tipo === "sala") {
    const { data, error } = await admin
      .from("workspaces")
      .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tipo", "sala_de_venta")
      .select()
      .maybeSingle();
    if (error) throw new ServiceError(error.message, 400);
    return assertFound(data, "Sala no encontrada.");
  }
  const { data, error } = await admin
    .from("empresas")
    .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 400);
  return assertFound(data, "Empresa no encontrada.");
}
