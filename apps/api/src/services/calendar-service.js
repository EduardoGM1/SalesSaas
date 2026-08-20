import { isUuid } from "@salesapp/shared/data/mappers.js";
import { bodyToCalInsert } from "@salesapp/shared/api/validators.js";
import { CALENDAR_LIST_COLUMNS } from "@salesapp/shared/data/sync-columns.js";
import { ServiceError, assertFound } from "../lib/service-error.js";
import { getRequestWorkspaceContext, scopeByWorkspace } from "../lib/workspace-scope.js";

export async function listCalendarEntries(supabase, userId, { limit, offset, from, to, prospect_id }) {
  const ctx = await getRequestWorkspaceContext(supabase, userId);
  let q = supabase
    .from("calendar_entries")
    .select(CALENDAR_LIST_COLUMNS, { count: "exact" })
    .order("entry_date", { ascending: false })
    .range(offset, offset + limit - 1);
  q = scopeByWorkspace(q, ctx.workspaceId);
  if (!ctx.teamScope) q = q.eq("user_id", userId);
  if (from) q = q.gte("entry_date", from);
  if (to) q = q.lte("entry_date", to);
  if (prospect_id && isUuid(prospect_id)) q = q.eq("prospect_id", prospect_id);
  const { data, error, count } = await q;
  if (error) throw new ServiceError(error.message, 500);
  return { data: data ?? [], total: count ?? 0, limit, offset };
}

export async function createCalendarEntry(supabase, userId, body) {
  const ctx = await getRequestWorkspaceContext(supabase, userId);
  const row = bodyToCalInsert(body, userId, ctx.workspaceId);
  if (!row) throw new ServiceError("type y entry_date/date son requeridos.");
  const { data, error } = await supabase.from("calendar_entries").insert(row).select().single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function getCalendarEntry(supabase, userId, id) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const ctx = await getRequestWorkspaceContext(supabase, userId);
  let q = supabase.from("calendar_entries").select(CALENDAR_LIST_COLUMNS).eq("id", id);
  q = scopeByWorkspace(q, ctx.workspaceId);
  if (!ctx.teamScope) q = q.eq("user_id", userId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  return assertFound(data, "Entrada no encontrada.");
}

export async function updateCalendarEntry(supabase, userId, id, body) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const patch = { ...body };
  delete patch.id;
  delete patch.user_id;
  const ctx = await getRequestWorkspaceContext(supabase, userId);
  // Solo el dueño puede editar (aunque teamScope permita ver).
  let q = supabase.from("calendar_entries").update(patch).eq("id", id).eq("user_id", userId);
  q = scopeByWorkspace(q, ctx.workspaceId);
  const { data, error } = await q.select().maybeSingle();
  if (error) throw new ServiceError(error.message, 400);
  return assertFound(data, "Entrada no encontrada.");
}

export async function deleteCalendarEntry(supabase, userId, id) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const ctx = await getRequestWorkspaceContext(supabase, userId);
  let q = supabase.from("calendar_entries").delete({ count: "exact" }).eq("id", id).eq("user_id", userId);
  q = scopeByWorkspace(q, ctx.workspaceId);
  const { error, count } = await q;
  if (error) throw new ServiceError(error.message, 400);
  if (!count) throw new ServiceError("Entrada no encontrada.", 404);
  return { ok: true };
}
