import { isUuid } from "@salesapp/shared/data/mappers.js";
import { bodyToActivityInsert } from "@salesapp/shared/api/validators.js";
import { ServiceError, assertFound } from "../lib/service-error.js";

export async function listActivities(supabase, userId, { limit, offset, prospect_id }) {
  let q = supabase
    .from("activities")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (prospect_id && isUuid(prospect_id)) q = q.eq("prospect_id", prospect_id);
  const { data, error, count } = await q;
  if (error) throw new ServiceError(error.message, 500);
  return { data: data ?? [], total: count ?? 0, limit, offset };
}

export async function createActivity(supabase, userId, body) {
  const row = bodyToActivityInsert(body, userId);
  if (!row) throw new ServiceError("type es requerido.");
  const { data, error } = await supabase.from("activities").insert(row).select().single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function getActivity(supabase, userId, id) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const { data, error } = await supabase.from("activities").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  return assertFound(data, "Actividad no encontrada.");
}

export async function updateActivity(supabase, userId, id, body) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const patch = { ...body };
  delete patch.id;
  delete patch.user_id;
  const { data, error } = await supabase.from("activities").update(patch).eq("id", id).eq("user_id", userId).select().maybeSingle();
  if (error) throw new ServiceError(error.message, 400);
  return assertFound(data, "Actividad no encontrada.");
}

export async function deleteActivity(supabase, userId, id) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const { error, count } = await supabase.from("activities").delete({ count: "exact" }).eq("id", id).eq("user_id", userId);
  if (error) throw new ServiceError(error.message, 400);
  if (!count) throw new ServiceError("Actividad no encontrada.", 404);
  return { ok: true };
}
