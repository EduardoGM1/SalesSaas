/**
 * Agenda (calendar_entries). Edición/borrado siempre por dueño, aunque teamScope permita ver.
 */
import { isUuid } from "@salesapp/shared/data/mappers.js";
import { bodyToCalInsert } from "@salesapp/shared/api/validators.js";
import { ServiceError } from "../lib/service-error.js";
import { getRequestWorkspaceContext } from "../lib/workspace-scope.js";
import * as agendaRepo from "../repositories/calendar-repository.js";

export async function listarEntradasAgenda(supabase, userId, { limit, offset, from, to, prospect_id }) {
  const ctx = await getRequestWorkspaceContext(supabase, userId);
  return agendaRepo.listarEntradasAgenda(supabase, {
    userId,
    workspaceId: ctx.workspaceId,
    teamScope: ctx.teamScope,
    limit,
    offset,
    from,
    to,
    prospect_id,
  });
}

export async function crearEntradaAgenda(supabase, userId, body) {
  const ctx = await getRequestWorkspaceContext(supabase, userId);
  const row = bodyToCalInsert(body, userId, ctx.workspaceId);
  if (!row) throw new ServiceError("type y entry_date/date son requeridos.");
  return agendaRepo.insertarEntradaAgenda(supabase, row);
}

export async function obtenerEntradaAgenda(supabase, userId, id) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const ctx = await getRequestWorkspaceContext(supabase, userId);
  return agendaRepo.obtenerEntradaAgenda(supabase, {
    id,
    userId,
    workspaceId: ctx.workspaceId,
    teamScope: ctx.teamScope,
  });
}

export async function actualizarEntradaAgenda(supabase, userId, id, body) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const patch = { ...body };
  delete patch.id;
  delete patch.user_id;
  const ctx = await getRequestWorkspaceContext(supabase, userId);
  return agendaRepo.actualizarEntradaAgenda(supabase, {
    id,
    userId,
    workspaceId: ctx.workspaceId,
    patch,
  });
}

export async function eliminarEntradaAgenda(supabase, userId, id) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const ctx = await getRequestWorkspaceContext(supabase, userId);
  await agendaRepo.eliminarEntradaAgenda(supabase, {
    id,
    userId,
    workspaceId: ctx.workspaceId,
  });
  return { ok: true };
}

export const listCalendarEntries = listarEntradasAgenda;
export const createCalendarEntry = crearEntradaAgenda;
export const getCalendarEntry = obtenerEntradaAgenda;
export const updateCalendarEntry = actualizarEntradaAgenda;
export const deleteCalendarEntry = eliminarEntradaAgenda;
