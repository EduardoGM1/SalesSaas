import { isUuid } from "@salesapp/shared/data/mappers.js";
import { ServiceError, assertFound } from "../lib/service-error.js";

const SALA_ROLES = new Set(["admin_sala", "gerente", "vendedor"]);

async function ensurePersonalWorkspace(supabase, userId) {
  const { data, error } = await supabase.rpc("ensure_personal_workspace", { p_uid: userId });
  if (error) {
    // Migración 0054 no aplicada: degradar sin tumbar sesión/API.
    if (String(error.message || "").includes("does not exist") || error.code === "PGRST202") {
      return null;
    }
    throw new ServiceError(error.message, 400);
  }
  return data;
}

function mapWorkspace(row, members = []) {
  return {
    id: row.id,
    tipo: row.tipo,
    organizacion_id: row.organizacion_id ?? null,
    owner_id: row.owner_id,
    nombre: row.nombre,
    created_at: row.created_at,
    members,
  };
}

export async function listMyWorkspaces(supabase, userId) {
  await ensurePersonalWorkspace(supabase, userId);

  const { data: memberRows, error: mErr } = await supabase
    .from("workspace_miembros")
    .select("workspace_id, rol_en_workspace, created_at")
    .eq("usuario_id", userId);
  if (errorIsMissing(mErr)) return { workspaces: [], active_workspace_id: null, organizacion_id: null };
  if (mErr) throw new ServiceError(mErr.message, 500);

  const ids = [...new Set((memberRows ?? []).map((r) => r.workspace_id))];
  if (!ids.length) {
    const personalId = await ensurePersonalWorkspace(supabase, userId);
    return {
      workspaces: personalId
        ? [{ id: personalId, tipo: "personal", organizacion_id: null, owner_id: userId, nombre: "Espacio personal", members: [] }]
        : [],
      active_workspace_id: personalId,
      organizacion_id: null,
    };
  }

  const { data: rows, error } = await supabase
    .from("workspaces")
    .select("id, tipo, organizacion_id, owner_id, nombre, created_at")
    .in("id", ids)
    .order("created_at", { ascending: true });
  if (error) throw new ServiceError(error.message, 500);

  const roleByWs = new Map((memberRows ?? []).map((r) => [r.workspace_id, r.rol_en_workspace]));
  const workspaces = (rows ?? []).map((row) => ({
    ...mapWorkspace(row),
    my_role: roleByWs.get(row.id) || null,
  }));

  const personal = workspaces.find((w) => w.tipo === "personal");
  const orgId = workspaces.find((w) => w.tipo === "sala_de_ventas" && w.organizacion_id)?.organizacion_id ?? null;

  const settings = await loadSettings(supabase, userId);
  let activeId = settings?.active_workspace_id || null;
  if (!activeId || !workspaces.some((w) => w.id === activeId)) {
    activeId = personal?.id || workspaces[0]?.id || null;
  }

  return {
    workspaces,
    active_workspace_id: activeId,
    organizacion_id: orgId,
  };
}

function errorIsMissing(error) {
  if (!error) return false;
  const msg = String(error.message || "");
  return msg.includes("does not exist") || error.code === "PGRST205" || error.code === "42P01";
}

async function loadSettings(supabase, userId) {
  const { data } = await supabase.from("profiles").select("settings").eq("id", userId).maybeSingle();
  return data?.settings && typeof data.settings === "object" ? data.settings : {};
}

export async function setActiveWorkspace(supabase, userId, workspaceId) {
  if (!isUuid(workspaceId)) throw new ServiceError("Workspace inválido.");
  const { data: member } = await supabase
    .from("workspace_miembros")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("usuario_id", userId)
    .maybeSingle();
  if (!member) throw new ServiceError("No perteneces a este workspace.", 403);

  const settings = await loadSettings(supabase, userId);
  const next = { ...settings, active_workspace_id: workspaceId };
  const { error } = await supabase.from("profiles").update({ settings: next }).eq("id", userId);
  if (error) throw new ServiceError(error.message, 400);
  return { active_workspace_id: workspaceId };
}

export async function createOrganization(supabase, userId, { nombre }) {
  const name = typeof nombre === "string" ? nombre.trim() : "";
  if (!name || name.length < 2) throw new ServiceError("Nombre de organización inválido.");

  const { data, error } = await supabase
    .from("organizaciones")
    .insert({ nombre: name, created_by: userId })
    .select("id, nombre, created_at, created_by")
    .single();
  if (errorIsMissing(error)) throw new ServiceError("Workspaces no disponibles (aplica migración 0054).", 503);
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function createSalaWorkspace(supabase, userId, { nombre, organizacion_id: orgId }) {
  const name = typeof nombre === "string" ? nombre.trim() : "";
  if (!name) throw new ServiceError("Nombre de sala inválido.");
  if (!isUuid(orgId)) throw new ServiceError("Organización inválida.");

  const existingOrg = await supabase.rpc("user_org_id", { p_uid: userId }).then((r) => r.data).catch(() => null);
  // Permitir crear sala si no tiene org, o si es la misma org (dueño/admin)
  if (existingOrg && existingOrg !== orgId) {
    throw new ServiceError("Ya perteneces a otra organización.", 403);
  }

  const { data: org, error: orgErr } = await supabase
    .from("organizaciones")
    .select("id, created_by")
    .eq("id", orgId)
    .maybeSingle();
  if (orgErr) throw new ServiceError(orgErr.message, 500);
  assertFound(org, "Organización no encontrada.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_super_admin, role")
    .eq("id", userId)
    .maybeSingle();
  const isAdmin = profile?.is_super_admin === true || profile?.role === "admin" || org.created_by === userId;
  if (!isAdmin) {
    throw new ServiceError("Solo el dueño de la organización o un admin puede crear salas.", 403);
  }

  const { data: ws, error } = await supabase
    .from("workspaces")
    .insert({
      tipo: "sala_de_ventas",
      organizacion_id: orgId,
      owner_id: userId,
      nombre: name,
    })
    .select("id, tipo, organizacion_id, owner_id, nombre, created_at")
    .single();
  if (error) throw new ServiceError(error.message, 400);

  const { error: memErr } = await supabase.rpc("workspace_add_member", {
    p_workspace_id: ws.id,
    p_usuario_id: userId,
    p_rol: "admin_sala",
  });
  if (memErr) throw new ServiceError(memErr.message, 400);

  return mapWorkspace(ws);
}

export async function addWorkspaceMember(supabase, userId, workspaceId, { usuario_id: targetId, rol = "vendedor" }) {
  if (!isUuid(workspaceId)) throw new ServiceError("Workspace inválido.");
  if (!isUuid(targetId)) throw new ServiceError("Usuario inválido.");
  if (!SALA_ROLES.has(rol)) throw new ServiceError("Rol de workspace inválido.");

  const { error } = await supabase.rpc("workspace_add_member", {
    p_workspace_id: workspaceId,
    p_usuario_id: targetId,
    p_rol: rol,
  });
  if (error) {
    const msg = error.message || "";
    if (msg.includes("otra organización")) throw new ServiceError("El usuario ya pertenece a otra organización.", 403);
    if (msg.includes("No autorizado")) throw new ServiceError("No autorizado.", 403);
    throw new ServiceError(msg, 400);
  }
  return { ok: true, workspace_id: workspaceId, usuario_id: targetId, rol };
}

export async function removeWorkspaceMember(supabase, userId, workspaceId, targetId) {
  if (!isUuid(workspaceId)) throw new ServiceError("Workspace inválido.");
  if (!isUuid(targetId)) throw new ServiceError("Usuario inválido.");

  const { error } = await supabase.rpc("workspace_remove_member", {
    p_workspace_id: workspaceId,
    p_usuario_id: targetId,
  });
  if (error) {
    const msg = error.message || "";
    if (msg.includes("No autorizado")) throw new ServiceError("No autorizado.", 403);
    throw new ServiceError(msg, 400);
  }
  return { ok: true };
}

export async function listWorkspaceMembers(supabase, userId, workspaceId) {
  if (!isUuid(workspaceId)) throw new ServiceError("Workspace inválido.");
  const { data: me } = await supabase
    .from("workspace_miembros")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("usuario_id", userId)
    .maybeSingle();
  if (!me) throw new ServiceError("No autorizado.", 403);

  const { data, error } = await supabase
    .from("workspace_miembros")
    .select("workspace_id, usuario_id, rol_en_workspace, created_at, profiles:usuario_id(id, full_name, email, avatar_url)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) throw new ServiceError(error.message, 500);
  return (data ?? []).map((row) => ({
    workspace_id: row.workspace_id,
    usuario_id: row.usuario_id,
    rol_en_workspace: row.rol_en_workspace,
    created_at: row.created_at,
    profile: row.profiles ?? null,
  }));
}

export async function getPersonalWorkspaceId(supabase, userId) {
  const id = await ensurePersonalWorkspace(supabase, userId);
  if (id) return id;
  const { data } = await supabase
    .from("workspaces")
    .select("id")
    .eq("tipo", "personal")
    .eq("owner_id", userId)
    .maybeSingle();
  return data?.id ?? null;
}

export { ensurePersonalWorkspace };
