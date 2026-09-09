/**
 * Sincronización del blob CRM (AppDatabase) del usuario con Supabase.
 * El alcance (workspace activo + visibilidad de equipo) sale de la sesión,
 * nunca del cuerpo de la petición.
 */
import { pullAll, reconcile } from "@salesapp/shared/data/sync.js";
import { normalizeIds } from "@salesapp/shared/data/mappers.js";
import { ServiceError } from "../lib/service-error.js";
import { logger } from "../lib/logger.js";
import { getRequestWorkspaceContext } from "../lib/workspace-scope.js";

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

/** Reconcilia el blob local con el servidor y devuelve el estado resultante. */
export async function reconciliarBaseDatosUsuario(supabase, userId, incoming) {
  const t0 = Date.now();
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    throw new ServiceError("Cuerpo debe incluir { data: AppDatabase }.");
  }
  try {
    const ctx = await getRequestWorkspaceContext(supabase, userId);
    const { db } = normalizeIds(incoming);
    await reconcile(supabase, db, userId, ctx.workspaceId, { teamScope: ctx.teamScope });
    const result = await pullAll(supabase, userId, ctx.workspaceId, { teamScope: ctx.teamScope });
    logger.info("sync.reconcile.ok", { ms: Date.now() - t0 });
    return result;
  } catch (err) {
    logger.error("sync.reconcile.failed", { ms: Date.now() - t0, error: err });
    throw err;
  }
}
