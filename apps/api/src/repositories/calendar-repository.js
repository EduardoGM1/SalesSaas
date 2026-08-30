/**
 * Persistencia de entradas de agenda. teamScope solo afecta lecturas.
 */
import { isUuid } from "@salesapp/shared/data/mappers.js";
import { CALENDAR_LIST_COLUMNS } from "@salesapp/shared/data/sync-columns.js";
import { ServiceError, assertFound } from "../lib/service-error.js";
import { scopeByWorkspace } from "../lib/workspace-scope.js";

export async function listarEntradasAgenda(supabase, { userId, workspaceId, teamScope, limit, offset, from, to, prospect_id }) {
  let q = supabase
    .from("calendar_entries")
    .select(CALENDAR_LIST_COLUMNS, { count: "exact" })
    .order("entry_date", { ascending: false })
    .range(offset, offset + limit - 1);
  q = scopeByWorkspace(q, workspaceId);
  if (!teamScope) q = q.eq("user_id", userId);
  if (from) q = q.gte("entry_date", from);
  if (to) q = q.lte("entry_date", to);
  if (prospect_id && isUuid(prospect_id)) q = q.eq("prospect_id", prospect_id);
  const { data, error, count } = await q;
  if (error) throw new ServiceError(error.message, 500);
  return { data: data ?? [], total: count ?? 0, limit, offset };
}

export async function insertarEntradaAgenda(supabase, row) {
  const { data, error } = await supabase.from("calendar_entries").insert(row).select().single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function obtenerEntradaAgenda(supabase, { id, userId, workspaceId, teamScope }) {
  let q = supabase.from("calendar_entries").select(CALENDAR_LIST_COLUMNS).eq("id", id);
  q = scopeByWorkspace(q, workspaceId);
  if (!teamScope) q = q.eq("user_id", userId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  return assertFound(data, "Entrada no encontrada.");
}

export async function actualizarEntradaAgenda(supabase, { id, userId, workspaceId, patch }) {
  let q = supabase.from("calendar_entries").update(patch).eq("id", id).eq("user_id", userId);
  q = scopeByWorkspace(q, workspaceId);
  const { data, error } = await q.select().maybeSingle();
  if (error) throw new ServiceError(error.message, 400);
  return assertFound(data, "Entrada no encontrada.");
}

export async function eliminarEntradaAgenda(supabase, { id, userId, workspaceId }) {
  let q = supabase.from("calendar_entries").delete({ count: "exact" }).eq("id", id).eq("user_id", userId);
  q = scopeByWorkspace(q, workspaceId);
  const { error, count } = await q;
  if (error) throw new ServiceError(error.message, 400);
  if (!count) throw new ServiceError("Entrada no encontrada.", 404);
}
