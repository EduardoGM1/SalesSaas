/**
 * Ventas del workspace. Al pasar a cancelada se dispara recálculo RH (mismo hook de antes).
 */
import { isUuid } from "@salesapp/shared/data/mappers.js";
import { bodyToSaleInsert } from "@salesapp/shared/api/validators.js";
import { ServiceError } from "../lib/service-error.js";
import {
  getRequestWorkspaceContext,
  requireWorkspacePermission,
} from "../lib/workspace-scope.js";
import * as ventasRepo from "../repositories/sales-repository.js";

export async function listarVentas(supabase, userId, { limit, offset, prospect_id, from, to }) {
  const ctx = await getRequestWorkspaceContext(supabase, userId);
  await requireWorkspacePermission(supabase, userId, "sales:history", ctx.workspaceId);
  return ventasRepo.listarVentas(supabase, {
    userId,
    workspaceId: ctx.workspaceId,
    teamScope: ctx.teamScope,
    limit,
    offset,
    prospect_id,
    from,
    to,
  });
}

export async function crearVenta(supabase, userId, body) {
  const workspaceId = await requireWorkspacePermission(supabase, userId, "ventas:registrar");
  const row = bodyToSaleInsert(body, userId, undefined, workspaceId);
  if (!row) throw new ServiceError("prospect_id y sale_date/date son requeridos.");
  return ventasRepo.insertarVenta(supabase, row);
}

export async function obtenerVenta(supabase, userId, id) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const ctx = await getRequestWorkspaceContext(supabase, userId);
  await requireWorkspacePermission(supabase, userId, "sales:view_detail", ctx.workspaceId);
  return ventasRepo.obtenerVenta(supabase, {
    id,
    userId,
    workspaceId: ctx.workspaceId,
    teamScope: ctx.teamScope,
  });
}

export async function actualizarVenta(supabase, userId, id, body) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const patch = { ...body };
  delete patch.id;
  delete patch.user_id;
  const workspaceId = await requireWorkspacePermission(supabase, userId, "ventas:editar");
  const sale = await ventasRepo.actualizarVenta(supabase, { id, userId, workspaceId, patch });
  if (String(patch.status || "").toLowerCase() === "cancelada") {
    try {
      const { handleCancelacionVenta } = await import("./royal-holiday-service.js");
      await handleCancelacionVenta(id);
    } catch (err) {
      console.warn("[rh] cancelacion comisión:", err instanceof Error ? err.message : err);
    }
  }
  return sale;
}

export async function eliminarVenta(supabase, userId, id) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const workspaceId = await requireWorkspacePermission(supabase, userId, "ventas:cancelar");
  await ventasRepo.eliminarVenta(supabase, { id, userId, workspaceId });
  return { ok: true };
}

export const listSales = listarVentas;
export const createSale = crearVenta;
export const getSale = obtenerVenta;
export const updateSale = actualizarVenta;
export const deleteSale = eliminarVenta;
