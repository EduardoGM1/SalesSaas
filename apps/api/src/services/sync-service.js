import { pullAll, reconcile } from "@salesapp/shared/data/sync.js";
import { normalizeIds } from "@salesapp/shared/data/mappers.js";
import { ServiceError } from "../lib/service-error.js";
import { getRequestWorkspaceContext } from "../lib/workspace-scope.js";

/** @deprecated usar obtenerBaseDatosUsuario */
export async function pullUserDatabase(supabase, userId) {
  return obtenerBaseDatosUsuario(supabase, userId);
}

export async function obtenerBaseDatosUsuario(supabase, userId) {
  const t0 = Date.now();
  try {
    const ctx = await getRequestWorkspaceContext(supabase, userId);
    const db = await pullAll(supabase, userId, ctx.workspaceId, { teamScope: ctx.teamScope });
    console.info("[sync] obtenerBaseDatosUsuario ok", {
      userId,
      workspaceId: ctx.workspaceId,
      ms: Date.now() - t0,
      clients: Object.keys(db.clients || {}).length,
    });
    return db;
  } catch (err) {
    console.error("[sync] obtenerBaseDatosUsuario failed", {
      userId,
      ms: Date.now() - t0,
      message: err?.message || String(err),
    });
    throw err;
  }
}

/** @deprecated usar reconciliarBaseDatosUsuario */
export async function reconcileUserDatabase(supabase, userId, incoming) {
  return reconciliarBaseDatosUsuario(supabase, userId, incoming);
}

export async function reconciliarBaseDatosUsuario(supabase, userId, incoming) {
  const t0 = Date.now();
  if (!incoming || typeof incoming !== "object") {
    throw new ServiceError("Cuerpo debe incluir { data: AppDatabase }.");
  }
  try {
    const ctx = await getRequestWorkspaceContext(supabase, userId);
    const { db } = normalizeIds(incoming);
    await reconcile(supabase, db, userId, ctx.workspaceId, { teamScope: ctx.teamScope });
    const result = await pullAll(supabase, userId, ctx.workspaceId, { teamScope: ctx.teamScope });
    console.info("[sync] reconciliarBaseDatosUsuario ok", {
      userId,
      workspaceId: ctx.workspaceId,
      ms: Date.now() - t0,
    });
    return result;
  } catch (err) {
    console.error("[sync] reconciliarBaseDatosUsuario failed", {
      userId,
      ms: Date.now() - t0,
      message: err?.message || String(err),
    });
    throw err;
  }
}
