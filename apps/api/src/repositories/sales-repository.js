/**
 * Persistencia de ventas. Cancelación RH la orquesta el service, no este archivo.
 */
import { isUuid } from "@salesapp/shared/data/mappers.js";
import { SALE_LIST_COLUMNS } from "@salesapp/shared/data/sync-columns.js";
import { ServiceError, assertFound } from "../lib/service-error.js";
import { scopeByWorkspace } from "../lib/workspace-scope.js";

export async function listarVentas(supabase, { userId, workspaceId, teamScope, limit, offset, prospect_id, from, to }) {
  let q = supabase
    .from("sales")
    .select(`${SALE_LIST_COLUMNS}, prospects(name, name1, prospect_code)`, { count: "exact" })
    .order("sale_date", { ascending: false })
    .range(offset, offset + limit - 1);
  q = scopeByWorkspace(q, workspaceId);
  if (!teamScope) q = q.eq("user_id", userId);
  if (prospect_id && isUuid(prospect_id)) q = q.eq("prospect_id", prospect_id);
  if (from) q = q.gte("sale_date", from);
  if (to) q = q.lte("sale_date", to);
  const { data, error, count } = await q;
  if (error) throw new ServiceError(error.message, 500);
  return { data: data ?? [], total: count ?? 0, limit, offset };
}

export async function insertarVenta(supabase, row) {
  const { data, error } = await supabase.from("sales").insert(row).select().single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function obtenerVenta(supabase, { id, userId, workspaceId, teamScope }) {
  let q = supabase.from("sales").select(SALE_LIST_COLUMNS).eq("id", id);
  q = scopeByWorkspace(q, workspaceId);
  if (!teamScope) q = q.eq("user_id", userId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  return assertFound(data, "Venta no encontrada.");
}

export async function actualizarVenta(supabase, { id, userId, workspaceId, patch }) {
  let q = supabase.from("sales").update(patch).eq("id", id).eq("user_id", userId);
  q = scopeByWorkspace(q, workspaceId);
  const { data, error } = await q.select().maybeSingle();
  if (error) throw new ServiceError(error.message, 400);
  return assertFound(data, "Venta no encontrada.");
}

export async function eliminarVenta(supabase, { id, userId, workspaceId }) {
  let q = supabase.from("sales").delete({ count: "exact" }).eq("id", id).eq("user_id", userId);
  q = scopeByWorkspace(q, workspaceId);
  const { error, count } = await q;
  if (error) throw new ServiceError(error.message, 400);
  if (!count) throw new ServiceError("Venta no encontrada.", 404);
}
