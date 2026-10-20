/**
 * Agenda (calendar_entries). Edición/borrado siempre por dueño, aunque teamScope permita ver.
 */
import { isUuid } from "@salesapp/shared/data/mappers.js";
import { bodyToCalInsert } from "@salesapp/shared/api/validators.js";
import { ServiceError } from "../../../lib/service-error.js";
import { calendarEntryToPatch } from "../../../lib/patch-whitelist.js";
import { getRequestWorkspaceContext } from "../../../lib/workspace-scope.js";
import * as repositorioAgenda from "../repositorio/entradas-agenda-repositorio.js";
import { MSG_ID_INVALIDO, MSG_TIPO_FECHA } from "../dominio/mensajes-agenda.js";

export async function listarEntradasAgenda(supabase, userId, { limit, offset, from, to, prospect_id }) {
  const ctx = await getRequestWorkspaceContext(supabase, userId);
  return repositorioAgenda.listarEntradasAgenda(supabase, {
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
  if (!row) throw new ServiceError(MSG_TIPO_FECHA);
  return repositorioAgenda.insertarEntradaAgenda(supabase, row);
}

export async function obtenerEntradaAgenda(supabase, userId, id) {
  if (!isUuid(id)) throw new ServiceError(MSG_ID_INVALIDO);
  const ctx = await getRequestWorkspaceContext(supabase, userId);
  return repositorioAgenda.obtenerEntradaAgenda(supabase, {
    id,
    userId,
    workspaceId: ctx.workspaceId,
    teamScope: ctx.teamScope,
  });
}

export async function actualizarEntradaAgenda(supabase, userId, id, body) {
  if (!isUuid(id)) throw new ServiceError(MSG_ID_INVALIDO);
  const patch = calendarEntryToPatch(body);
  const ctx = await getRequestWorkspaceContext(supabase, userId);
  return repositorioAgenda.actualizarEntradaAgenda(supabase, {
    id,
    userId,
    workspaceId: ctx.workspaceId,
    patch,
  });
}

export async function eliminarEntradaAgenda(supabase, userId, id) {
  if (!isUuid(id)) throw new ServiceError(MSG_ID_INVALIDO);
  const ctx = await getRequestWorkspaceContext(supabase, userId);
  await repositorioAgenda.eliminarEntradaAgenda(supabase, {
    id,
    userId,
    workspaceId: ctx.workspaceId,
  });
  return { ok: true };
}
