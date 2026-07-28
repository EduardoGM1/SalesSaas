import { isUuid } from "@salesapp/shared/data/mappers.js";
import { bodyToSaleInsert } from "@salesapp/shared/api/validators.js";
import { ServiceError, assertFound } from "../lib/service-error.js";
import { requireWorkspacePermission, scopeByWorkspace } from "../lib/workspace-scope.js";

export async function listSales(supabase, userId, { limit, offset, prospect_id, from, to }) {
  const workspaceId = await requireWorkspacePermission(supabase, userId, "sales:history");
  let q = supabase
    .from("sales")
    .select("*, prospect_name, prospects(name, name1, prospect_code)", { count: "exact" })
    .eq("user_id", userId)
    .order("sale_date", { ascending: false })
    .range(offset, offset + limit - 1);
  q = scopeByWorkspace(q, workspaceId);
  if (prospect_id && isUuid(prospect_id)) q = q.eq("prospect_id", prospect_id);
  if (from) q = q.gte("sale_date", from);
  if (to) q = q.lte("sale_date", to);
  const { data, error, count } = await q;
  if (error) throw new ServiceError(error.message, 500);
  return { data: data ?? [], total: count ?? 0, limit, offset };
}

export async function createSale(supabase, userId, body) {
  const workspaceId = await requireWorkspacePermission(supabase, userId, "ventas:registrar");
  const row = bodyToSaleInsert(body, userId, undefined, workspaceId);
  if (!row) throw new ServiceError("prospect_id y sale_date/date son requeridos.");
  const { data, error } = await supabase.from("sales").insert(row).select().single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function getSale(supabase, userId, id) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const workspaceId = await requireWorkspacePermission(supabase, userId, "sales:view_detail");
  let q = supabase.from("sales").select("*").eq("id", id).eq("user_id", userId);
  q = scopeByWorkspace(q, workspaceId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  return assertFound(data, "Venta no encontrada.");
}

export async function updateSale(supabase, userId, id, body) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const patch = { ...body };
  delete patch.id;
  delete patch.user_id;
  const workspaceId = await requireWorkspacePermission(supabase, userId, "ventas:editar");
  let q = supabase.from("sales").update(patch).eq("id", id).eq("user_id", userId);
  q = scopeByWorkspace(q, workspaceId);
  const { data, error } = await q.select().maybeSingle();
  if (error) throw new ServiceError(error.message, 400);
  return assertFound(data, "Venta no encontrada.");
}

export async function deleteSale(supabase, userId, id) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const workspaceId = await requireWorkspacePermission(supabase, userId, "ventas:cancelar");
  let q = supabase.from("sales").delete({ count: "exact" }).eq("id", id).eq("user_id", userId);
  q = scopeByWorkspace(q, workspaceId);
  const { error, count } = await q;
  if (error) throw new ServiceError(error.message, 400);
  if (!count) throw new ServiceError("Venta no encontrada.", 404);
  return { ok: true };
}
