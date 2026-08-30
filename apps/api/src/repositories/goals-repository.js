/**
 * Persistencia de metas mensuales. Sin autorización: el service ya resolvió workspace.
 */
import { ServiceError } from "../lib/service-error.js";
import { scopeByWorkspace } from "../lib/workspace-scope.js";

export async function listarMetasDeUsuario(supabase, { userId, workspaceId, year }) {
  let q = supabase.from("goals").select("*").eq("user_id", userId);
  q = scopeByWorkspace(q, workspaceId);
  if (year) q = q.eq("year", Number(year));
  const { data, error } = await q;
  if (error) throw new ServiceError(error.message, 500);
  return data ?? [];
}

export async function guardarMetaDeUsuario(supabase, row) {
  const { data, error } = await supabase.from("goals").upsert(row, { onConflict: "user_id,year,month" }).select().single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function eliminarMetaDeUsuario(supabase, { userId, workspaceId, year, month }) {
  let q = supabase.from("goals").delete().eq("user_id", userId).eq("year", year).eq("month", month);
  q = scopeByWorkspace(q, workspaceId);
  const { error } = await q;
  if (error) throw new ServiceError(error.message, 400);
}
