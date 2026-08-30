/**
 * Actividades ligadas a expedientes. Lectura de equipo vs propias según teamScope.
 */
import { isUuid } from "@salesapp/shared/data/mappers.js";
import { bodyToActivityInsert } from "@salesapp/shared/api/validators.js";
import { ServiceError } from "../lib/service-error.js";
import {
  getRequestWorkspaceContext,
  requireWorkspacePermission,
} from "../lib/workspace-scope.js";
import * as actividadesRepo from "../repositories/activities-repository.js";

export async function listarActividades(supabase, userId, { limit, offset, prospect_id }) {
  const ctx = await getRequestWorkspaceContext(supabase, userId);
  const required = ctx.teamScope ? "expedientes:ver_equipo" : "expedientes:ver_propios";
  await requireWorkspacePermission(supabase, userId, required, ctx.workspaceId);
  return actividadesRepo.listarActividades(supabase, {
    userId,
    workspaceId: ctx.workspaceId,
    teamScope: ctx.teamScope,
    limit,
    offset,
    prospect_id,
  });
}

export async function crearActividad(supabase, userId, body) {
  const workspaceId = await requireWorkspacePermission(supabase, userId, "expedientes:editar");
  const row = bodyToActivityInsert(body, userId, workspaceId);
  if (!row) throw new ServiceError("type es requerido.");
  return actividadesRepo.insertarActividad(supabase, row);
}

export async function obtenerActividad(supabase, userId, id) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const ctx = await getRequestWorkspaceContext(supabase, userId);
  const required = ctx.teamScope ? "expedientes:ver_equipo" : "expedientes:ver_propios";
  await requireWorkspacePermission(supabase, userId, required, ctx.workspaceId);
  return actividadesRepo.obtenerActividad(supabase, {
    id,
    userId,
    workspaceId: ctx.workspaceId,
    teamScope: ctx.teamScope,
  });
}

export async function actualizarActividad(supabase, userId, id, body) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const patch = { ...body };
  delete patch.id;
  delete patch.user_id;
  const workspaceId = await requireWorkspacePermission(supabase, userId, "expedientes:editar");
  return actividadesRepo.actualizarActividad(supabase, { id, userId, workspaceId, patch });
}

export async function eliminarActividad(supabase, userId, id) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const workspaceId = await requireWorkspacePermission(supabase, userId, "expedientes:editar");
  await actividadesRepo.eliminarActividad(supabase, { id, userId, workspaceId });
  return { ok: true };
}

export const listActivities = listarActividades;
export const createActivity = crearActividad;
export const getActivity = obtenerActividad;
export const updateActivity = actualizarActividad;
export const deleteActivity = eliminarActividad;
