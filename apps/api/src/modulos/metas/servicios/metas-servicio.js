/**
 * Metas mensuales del vendedor en el workspace activo.
 * Autorización: metas:ver_editar_propias (fail-closed vía requireWorkspacePermission).
 * Contratos: tabla `goals`, `/api/v1/goals`, bodyToGoalUpsert (shared) — no renombrados.
 */
import { bodyToGoalUpsert } from "@salesapp/shared/api/validators.js";
import { ServiceError } from "../../../lib/service-error.js";
import { requireWorkspacePermission } from "../../../lib/workspace-scope.js";
import * as metasRepo from "../repositorio/metas-repositorio.js";
import { validarPeriodoMeta } from "../dominio/periodo-meta.js";

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
  const periodo = validarPeriodoMeta(year, month);
  if (!periodo.ok) throw new ServiceError(periodo.error);
  const workspaceId = await requireWorkspacePermission(supabase, userId, "metas:ver_editar_propias");
  await metasRepo.eliminarMetaDeUsuario(supabase, { userId, workspaceId, year, month });
  return { ok: true };
}
