import { isUuid } from "@salesapp/shared/data/mappers.js";
import { bodyToProspectInsert, bodyToProspectPatch } from "@salesapp/shared/api/validators.js";
import { ServiceError, assertFound } from "../lib/service-error.js";
import {
  getRequestWorkspaceContext,
  requireWorkspacePermission,
  scopeByWorkspace,
} from "../lib/workspace-scope.js";

export async function listProspects(supabase, userId, { limit, offset, status }) {
  const ctx = await getRequestWorkspaceContext(supabase, userId);
  await requireWorkspacePermission(supabase, userId, "expedientes:ver_propios", ctx.workspaceId);
  let q = supabase
    .from("prospects")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  q = scopeByWorkspace(q, ctx.workspaceId);
  if (!ctx.teamScope) q = q.eq("user_id", userId);
  if (status) q = q.eq("status", status);
  const { data, error, count } = await q;
  if (error) throw new ServiceError(error.message, 500);
  return { data: data ?? [], total: count ?? 0, limit, offset };
}

export async function createProspect(supabase, userId, body) {
  const workspaceId = await requireWorkspacePermission(supabase, userId, "expedientes:crear");
  const row = bodyToProspectInsert(body, userId, workspaceId);
  const { data, error } = await supabase.from("prospects").insert(row).select().single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function getProspect(supabase, userId, id) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const ctx = await getRequestWorkspaceContext(supabase, userId);
  await requireWorkspacePermission(supabase, userId, "expedientes:ver_propios", ctx.workspaceId);
  let q = supabase.from("prospects").select("*").eq("id", id);
  q = scopeByWorkspace(q, ctx.workspaceId);
  if (!ctx.teamScope) q = q.eq("user_id", userId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  return assertFound(data, "Expediente no encontrado.");
}

export async function updateProspect(supabase, userId, id, body) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const patch = bodyToProspectPatch(body);
  if (!Object.keys(patch).length) throw new ServiceError("Sin campos para actualizar.");
  const workspaceId = await requireWorkspacePermission(supabase, userId, "expedientes:editar");
  let q = supabase.from("prospects").update(patch).eq("id", id).eq("user_id", userId);
  q = scopeByWorkspace(q, workspaceId);
  const { data, error } = await q.select().maybeSingle();
  if (error) throw new ServiceError(error.message, 400);
  return assertFound(data, "Expediente no encontrado.");
}

export async function deleteProspect(supabase, userId, id) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const workspaceId = await requireWorkspacePermission(supabase, userId, "expedientes:eliminar");
  let q = supabase.from("prospects").delete({ count: "exact" }).eq("id", id).eq("user_id", userId);
  q = scopeByWorkspace(q, workspaceId);
  const { error, count } = await q;
  if (error) throw new ServiceError(error.message, 400);
  if (!count) throw new ServiceError("Expediente no encontrado.", 404);
  return { ok: true };
}
