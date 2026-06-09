import { isUuid } from "@salesapp/shared/data/mappers.js";
import { bodyToCalInsert } from "@salesapp/shared/api/validators.js";
import { ServiceError, assertFound } from "../lib/service-error.js";

export async function listCalendarEntries(supabase, userId, { limit, offset, from, to, prospect_id }) {
  let q = supabase
    .from("calendar_entries")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("entry_date", { ascending: false })
    .range(offset, offset + limit - 1);
  if (from) q = q.gte("entry_date", from);
  if (to) q = q.lte("entry_date", to);
  if (prospect_id && isUuid(prospect_id)) q = q.eq("prospect_id", prospect_id);
  const { data, error, count } = await q;
  if (error) throw new ServiceError(error.message, 500);
  return { data: data ?? [], total: count ?? 0, limit, offset };
}

export async function createCalendarEntry(supabase, userId, body) {
  const row = bodyToCalInsert(body, userId);
  if (!row) throw new ServiceError("type y entry_date/date son requeridos.");
  const { data, error } = await supabase.from("calendar_entries").insert(row).select().single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function getCalendarEntry(supabase, userId, id) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const { data, error } = await supabase.from("calendar_entries").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  return assertFound(data, "Entrada no encontrada.");
}

export async function updateCalendarEntry(supabase, userId, id, body) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const patch = { ...body };
  delete patch.id;
  delete patch.user_id;
  const { data, error } = await supabase.from("calendar_entries").update(patch).eq("id", id).eq("user_id", userId).select().maybeSingle();
  if (error) throw new ServiceError(error.message, 400);
  return assertFound(data, "Entrada no encontrada.");
}

export async function deleteCalendarEntry(supabase, userId, id) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const { error, count } = await supabase.from("calendar_entries").delete({ count: "exact" }).eq("id", id).eq("user_id", userId);
  if (error) throw new ServiceError(error.message, 400);
  if (!count) throw new ServiceError("Entrada no encontrada.", 404);
  return { ok: true };
}
