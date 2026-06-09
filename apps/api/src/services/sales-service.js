import { isUuid } from "@salesapp/shared/data/mappers.js";
import { bodyToSaleInsert } from "@salesapp/shared/api/validators.js";
import { ServiceError, assertFound } from "../lib/service-error.js";

export async function listSales(supabase, userId, { limit, offset, prospect_id, from, to }) {
  let q = supabase
    .from("sales")
    .select("*, prospects(name, name1, prospect_code)", { count: "exact" })
    .eq("user_id", userId)
    .order("sale_date", { ascending: false })
    .range(offset, offset + limit - 1);
  if (prospect_id && isUuid(prospect_id)) q = q.eq("prospect_id", prospect_id);
  if (from) q = q.gte("sale_date", from);
  if (to) q = q.lte("sale_date", to);
  const { data, error, count } = await q;
  if (error) throw new ServiceError(error.message, 500);
  return { data: data ?? [], total: count ?? 0, limit, offset };
}

export async function createSale(supabase, userId, body) {
  const row = bodyToSaleInsert(body, userId);
  if (!row) throw new ServiceError("prospect_id y sale_date/date son requeridos.");
  const { data, error } = await supabase.from("sales").insert(row).select().single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function getSale(supabase, userId, id) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const { data, error } = await supabase.from("sales").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  return assertFound(data, "Venta no encontrada.");
}

export async function updateSale(supabase, userId, id, body) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const patch = { ...body };
  delete patch.id;
  delete patch.user_id;
  const { data, error } = await supabase.from("sales").update(patch).eq("id", id).eq("user_id", userId).select().maybeSingle();
  if (error) throw new ServiceError(error.message, 400);
  return assertFound(data, "Venta no encontrada.");
}

export async function deleteSale(supabase, userId, id) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const { error, count } = await supabase.from("sales").delete({ count: "exact" }).eq("id", id).eq("user_id", userId);
  if (error) throw new ServiceError(error.message, 400);
  if (!count) throw new ServiceError("Venta no encontrada.", 404);
  return { ok: true };
}
