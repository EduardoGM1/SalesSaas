/**
 * Metas mensuales del vendedor en el workspace activo.
 * Autorización: metas:ver_editar_propias (fail-closed vía requireWorkspacePermission).
 */
import { bodyToGoalUpsert } from "@salesapp/shared/api/validators.js";
import { ServiceError } from "../lib/service-error.js";
import { requireWorkspacePermission } from "../lib/workspace-scope.js";
import * as metasRepo from "../repositories/goals-repository.js";

export async function listarMetas(supabase, userId, year) {
  const workspaceId = await requireWorkspacePermission(supabase, userId, "metas:ver_editar_propias");
  return metasRepo.listarMetasDeUsuario(supabase, { userId, workspaceId, year });
}

export async function guardarMeta(supabase, userId, body) {
  const workspaceId = await requireWorkspacePermission(supabase, userId, "metas:ver_editar_propias");
  const row = bodyToGoalUpsert(body, userId, workspaceId);
  if (!row) throw new ServiceError("year y month son requeridos.");
  return metasRepo.guardarMetaDeUsuario(supabase, row);
}

export async function eliminarMeta(supabase, userId, year, month) {
  if (!year || month < 0 || month > 11) throw new ServiceError("year y month requeridos.");
  const workspaceId = await requireWorkspacePermission(supabase, userId, "metas:ver_editar_propias");
  await metasRepo.eliminarMetaDeUsuario(supabase, { userId, workspaceId, year, month });
  return { ok: true };
}

/** Alias de compatibilidad interna. */
export const listGoals = listarMetas;
export const upsertGoal = guardarMeta;
export const deleteGoal = eliminarMeta;
