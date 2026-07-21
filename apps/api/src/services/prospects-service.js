import { isUuid } from "@salesapp/shared/data/mappers.js";
import { bodyToProspectInsert, bodyToProspectPatch } from "@salesapp/shared/api/validators.js";
import { ServiceError, assertFound } from "../lib/service-error.js";

async function resolveProspectOwnerFilter(supabase, userId, { scope, memberId } = {}) {
  const wantTeam = scope === "team" || scope === "equipo";
  if (memberId && memberId !== userId) {
    const { data: team } = await supabase.rpc("team_member_ids", { p_gerente_id: userId });
    const ids = Array.isArray(team) ? team : [];
    if (!ids.includes(memberId)) throw new ServiceError("Vendedor fuera de tu grupo.", 403);
    return { mode: "eq", userId: memberId };
  }
  if (wantTeam) {
    const { data: team } = await supabase.rpc("team_member_ids", { p_gerente_id: userId });
    const ids = Array.isArray(team) ? team : [];
    return { mode: "in", userIds: [userId, ...ids] };
  }
  return { mode: "eq", userId };
}

export async function listProspects(supabase, userId, { limit, offset, status, scope, memberId }) {
  const owner = await resolveProspectOwnerFilter(supabase, userId, { scope, memberId });
  let q = supabase
    .from("prospects")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (owner.mode === "in") q = q.in("user_id", owner.userIds);
  else q = q.eq("user_id", owner.userId);
  if (status) q = q.eq("status", status);
  const { data, error, count } = await q;
  if (error) throw new ServiceError(error.message, 500);
  return { data: data ?? [], total: count ?? 0, limit, offset };
}

export async function createProspect(supabase, userId, body) {
  const row = bodyToProspectInsert(body, userId);
  const { data, error } = await supabase.from("prospects").insert(row).select().single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function getProspect(supabase, userId, id) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  // SELECT: owner, share o gerente de grupo (RLS). No filtrar solo por user_id.
  const { data, error } = await supabase.from("prospects").select("*").eq("id", id).maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  return assertFound(data, "Expediente no encontrado.");
}

export async function updateProspect(supabase, userId, id, body) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const patch = bodyToProspectPatch(body);
  if (!Object.keys(patch).length) throw new ServiceError("Sin campos para actualizar.");
  const { data, error } = await supabase.from("prospects").update(patch).eq("id", id).eq("user_id", userId).select().maybeSingle();
  if (error) throw new ServiceError(error.message, 400);
  return assertFound(data, "Expediente no encontrado.");
}

export async function deleteProspect(supabase, userId, id) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const { error, count } = await supabase.from("prospects").delete({ count: "exact" }).eq("id", id).eq("user_id", userId);
  if (error) throw new ServiceError(error.message, 400);
  if (!count) throw new ServiceError("Expediente no encontrado.", 404);
  return { ok: true };
}
