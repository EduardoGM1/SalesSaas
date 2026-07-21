import { ServiceError } from "../lib/service-error.js";
import { isSuperAdmin } from "@salesapp/shared/auth/permissions.js";

function assertSuperAdmin(profile) {
  if (!isSuperAdmin(profile)) throw new ServiceError("No autorizado.", 403);
}

export async function listGroups(supabase, adminProfile) {
  assertSuperAdmin(adminProfile);
  const { data: groups, error } = await supabase
    .from("grupos")
    .select("id, nombre, gerente_id, organizacion_id, created_at")
    .order("nombre");
  if (error) throw new ServiceError(error.message, 400);

  const ids = (groups ?? []).map((g) => g.id);
  let membersByGroup = new Map();
  if (ids.length) {
    const { data: members } = await supabase
      .from("grupo_miembros")
      .select("grupo_id, usuario_id")
      .in("grupo_id", ids);
    for (const m of members ?? []) {
      if (!membersByGroup.has(m.grupo_id)) membersByGroup.set(m.grupo_id, []);
      membersByGroup.get(m.grupo_id).push(m.usuario_id);
    }
  }

  const userIds = new Set();
  for (const g of groups ?? []) {
    if (g.gerente_id) userIds.add(g.gerente_id);
    for (const uid of membersByGroup.get(g.id) || []) userIds.add(uid);
  }

  let profilesById = new Map();
  if (userIds.size) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", [...userIds]);
    profilesById = new Map((profiles ?? []).map((p) => [p.id, p]));
  }

  return (groups ?? []).map((g) => ({
    ...g,
    gerente: profilesById.get(g.gerente_id) || null,
    miembro_ids: membersByGroup.get(g.id) || [],
    miembros: (membersByGroup.get(g.id) || []).map((id) => profilesById.get(id)).filter(Boolean),
  }));
}

export async function upsertGroup(supabase, adminProfile, body) {
  assertSuperAdmin(adminProfile);
  const nombre = String(body?.nombre || "").trim();
  const gerenteId = body?.gerente_id;
  if (!nombre || !gerenteId) throw new ServiceError("Nombre y gerente son requeridos.");
  const miembroIds = Array.isArray(body?.miembro_ids) ? body.miembro_ids.filter(Boolean) : [];

  const { data, error } = await supabase.rpc("admin_upsert_grupo", {
    p_id: body?.id || null,
    p_nombre: nombre,
    p_gerente_id: gerenteId,
    p_organizacion_id: body?.organizacion_id || null,
    p_miembro_ids: miembroIds,
  });
  if (error) throw new ServiceError(error.message, 400);
  return { id: data };
}

export async function deleteGroup(supabase, adminProfile, groupId) {
  assertSuperAdmin(adminProfile);
  if (!groupId) throw new ServiceError("Grupo inválido.");
  const { error } = await supabase.rpc("admin_delete_grupo", { p_id: groupId });
  if (error) throw new ServiceError(error.message, 400);
  return { ok: true };
}

/** Miembros del equipo del usuario autenticado (gerente). */
export async function listMyTeam(supabase, userId) {
  const { data: ids, error } = await supabase.rpc("team_member_ids", { p_gerente_id: userId });
  if (error) throw new ServiceError(error.message, 400);
  const memberIds = Array.isArray(ids) ? ids : [];
  if (!memberIds.length) return [];
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, role_id")
    .in("id", memberIds)
    .order("full_name");
  if (pErr) throw new ServiceError(pErr.message, 400);
  return profiles ?? [];
}
