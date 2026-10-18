/**
 * Sincronización del blob CRM (AppDatabase) del usuario con Supabase.
 * El alcance (workspace activo + visibilidad de equipo) sale de la sesión,
 * nunca del cuerpo de la petición.
 */
import { SYNC_INSERT_PERMISSIONS, pullAll, reconcile, summarizeReport } from "@salesapp/shared/data/sync.js";
import { normalizeIds } from "@salesapp/shared/data/mappers.js";
import { ServiceError } from "../lib/service-error.js";
import { logger } from "../lib/logger.js";
import { getRequestWorkspaceContext, requireWorkspacePermission } from "../lib/workspace-scope.js";
import { createServiceSupabaseClient } from "../lib/supabase-server.js";

export const SYNC_PARTIAL_MESSAGE = "Algunos cambios no se pudieron sincronizar; se reintentará.";

/** Descarga la base completa del usuario en su workspace activo. */
export async function obtenerBaseDatosUsuario(supabase, userId) {
  const t0 = Date.now();
  try {
    const ctx = await getRequestWorkspaceContext(supabase, userId);
    const db = await pullAll(supabase, userId, ctx.workspaceId, { teamScope: ctx.teamScope });
    logger.info("sync.pull.ok", { ms: Date.now() - t0, clients: Object.keys(db.clients || {}).length });
    return db;
  } catch (err) {
    logger.error("sync.pull.failed", { ms: Date.now() - t0, error: err });
    throw err;
  }
}

/** Borra tombstones de más de 90 días. Lo llama el cron mensual. */
export async function purgarTombstonesExpedientes() {
  const admin = createServiceSupabaseClient();
  if (!admin) throw new ServiceError("Supabase no configurado.", 503);
  const { data, error } = await admin.rpc("purge_prospect_tombstones");
  if (error) throw new ServiceError(error.message, 500);
  return { deleted: data ?? 0 };
}

/** Mismo permiso de alta que REST por tabla; un 503 del RPC aborta el PUT completo. */
async function resolverPermisosAlta(supabase, userId, workspaceId) {
  if (!workspaceId) return () => false;
  const entries = await Promise.all(
    Object.entries(SYNC_INSERT_PERMISSIONS).map(async ([table, permission]) => {
      try {
        await requireWorkspacePermission(supabase, userId, permission, workspaceId);
        return [table, true];
      } catch (err) {
        if (err instanceof ServiceError && err.status === 403) return [table, false];
        throw err;
      }
    }),
  );
  const allowed = new Map(entries);
  return (table) => allowed.get(table) ?? true;
}

/**
 * Reconcilia el blob local con el servidor y devuelve el estado resultante.
 *
 * Protocolo 1 (clientes desplegados): con algún rechazo responde 409 `sync_partial`.
 * Esos clientes reemplazan su base local con cualquier 2xx, así que un 200 parcial
 * les borraría lo no subido; con el 409 conservan lo local y reintentan.
 * Protocolo 2 (`X-Sync-Protocol: 2`): 200 con `partial` y `rejected`.
 */
export async function reconciliarBaseDatosUsuario(supabase, userId, incoming, { protocol = "1" } = {}) {
  const t0 = Date.now();
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    throw new ServiceError("Cuerpo debe incluir { data: AppDatabase }.");
  }
  let report;
  let result;
  try {
    const ctx = await getRequestWorkspaceContext(supabase, userId);
    const canInsert = await resolverPermisosAlta(supabase, userId, ctx.workspaceId);
    const { db } = normalizeIds(incoming);
    report = await reconcile(supabase, db, userId, ctx.workspaceId, { canInsert });
    result = await pullAll(supabase, userId, ctx.workspaceId, { teamScope: ctx.teamScope });
  } catch (err) {
    logger.error("sync.reconcile.failed", { ms: Date.now() - t0, protocol, error: err });
    throw err;
  }

  const summary = summarizeReport(report);
  if (!report.rejected.length) {
    logger.info("sync.reconcile.ok", { ms: Date.now() - t0, protocol, ...summary });
    return { data: result };
  }
  logger.warn("sync.reconcile.partial", { ms: Date.now() - t0, protocol, ...summary });
  if (protocol === "2") {
    return { data: result, partial: true, rejected: report.rejected };
  }
  throw new ServiceError(SYNC_PARTIAL_MESSAGE, 409, "sync_partial", {
    rejected_counts: summary.rejected,
    rejected: report.rejected,
  });
}
