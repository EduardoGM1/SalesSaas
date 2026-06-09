import { isUuid } from "@salesapp/shared/data/mappers.js";
import { bodyToProspectInsert, bodyToProspectPatch } from "@salesapp/shared/api/validators.js";
import { ServiceError, assertFound } from "../lib/service-error.js";

export async function listProspects(supabase, userId, { limit, offset, status }) {
  let q = supabase
    .from("prospects")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
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
  const { data, error } = await supabase.from("prospects").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
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
