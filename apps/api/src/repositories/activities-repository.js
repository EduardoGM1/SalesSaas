/**
 * Persistencia de actividades de expediente. El service aplica permisos y teamScope.
 */
import { isUuid } from "@salesapp/shared/data/mappers.js";
import { ACTIVITY_LIST_COLUMNS } from "@salesapp/shared/data/sync-columns.js";
import { ServiceError, assertFound } from "../lib/service-error.js";
import { scopeByWorkspace } from "../lib/workspace-scope.js";

export async function listarActividades(supabase, { userId, workspaceId, teamScope, limit, offset, prospect_id }) {
  let q = supabase
    .from("activities")
    .select(ACTIVITY_LIST_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  q = scopeByWorkspace(q, workspaceId);
  if (!teamScope) q = q.eq("user_id", userId);
  if (prospect_id && isUuid(prospect_id)) q = q.eq("prospect_id", prospect_id);
  const { data, error, count } = await q;
  if (error) throw new ServiceError(error.message, 500);
  return { data: data ?? [], total: count ?? 0, limit, offset };
}

export async function insertarActividad(supabase, row) {
  const { data, error } = await supabase.from("activities").insert(row).select().single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function obtenerActividad(supabase, { id, userId, workspaceId, teamScope }) {
  let q = supabase.from("activities").select(ACTIVITY_LIST_COLUMNS).eq("id", id);
  q = scopeByWorkspace(q, workspaceId);
  if (!teamScope) q = q.eq("user_id", userId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  return assertFound(data, "Actividad no encontrada.");
}

export async function actualizarActividad(supabase, { id, userId, workspaceId, patch }) {
  let q = supabase.from("activities").update(patch).eq("id", id).eq("user_id", userId);
  q = scopeByWorkspace(q, workspaceId);
  const { data, error } = await q.select().maybeSingle();
  if (error) throw new ServiceError(error.message, 400);
  return assertFound(data, "Actividad no encontrada.");
}

export async function eliminarActividad(supabase, { id, userId, workspaceId }) {
  let q = supabase.from("activities").delete({ count: "exact" }).eq("id", id).eq("user_id", userId);
  q = scopeByWorkspace(q, workspaceId);
  const { error, count } = await q;
  if (error) throw new ServiceError(error.message, 400);
  if (!count) throw new ServiceError("Actividad no encontrada.", 404);
}
