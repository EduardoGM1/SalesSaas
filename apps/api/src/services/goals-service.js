import { bodyToGoalUpsert } from "@salesapp/shared/api/validators.js";
import { ServiceError } from "../lib/service-error.js";
import { requireWorkspacePermission, scopeByWorkspace } from "../lib/workspace-scope.js";

export async function listGoals(supabase, userId, year) {
  const workspaceId = await requireWorkspacePermission(supabase, userId, "metas:ver_editar_propias");
  let q = supabase.from("goals").select("*").eq("user_id", userId);
  q = scopeByWorkspace(q, workspaceId);
  if (year) q = q.eq("year", Number(year));
  const { data, error } = await q;
  if (error) throw new ServiceError(error.message, 500);
  return data ?? [];
}

export async function upsertGoal(supabase, userId, body) {
  const workspaceId = await requireWorkspacePermission(supabase, userId, "metas:ver_editar_propias");
  const row = bodyToGoalUpsert(body, userId, workspaceId);
  if (!row) throw new ServiceError("year y month son requeridos.");
  const { data, error } = await supabase.from("goals").upsert(row, { onConflict: "user_id,year,month" }).select().single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function deleteGoal(supabase, userId, year, month) {
  if (!year || month < 0 || month > 11) throw new ServiceError("year y month requeridos.");
  const workspaceId = await requireWorkspacePermission(supabase, userId, "metas:ver_editar_propias");
  let q = supabase.from("goals").delete().eq("user_id", userId).eq("year", year).eq("month", month);
  q = scopeByWorkspace(q, workspaceId);
  const { error } = await q;
  if (error) throw new ServiceError(error.message, 400);
  return { ok: true };
}
