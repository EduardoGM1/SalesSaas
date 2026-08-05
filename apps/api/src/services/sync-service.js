import { pullAll, reconcile } from "@salesapp/shared/data/sync.js";
import { normalizeIds } from "@salesapp/shared/data/mappers.js";
import { ServiceError } from "../lib/service-error.js";
import { getRequestWorkspaceContext } from "../lib/workspace-scope.js";

export async function pullUserDatabase(supabase, userId) {
  const t0 = Date.now();
  try {
    const ctx = await getRequestWorkspaceContext(supabase, userId);
    const db = await pullAll(supabase, userId, ctx.workspaceId, { teamScope: ctx.teamScope });
    console.info("[sync] pullUserDatabase ok", {
      userId,
      workspaceId: ctx.workspaceId,
      ms: Date.now() - t0,
      clients: Object.keys(db.clients || {}).length,
    });
    return db;
  } catch (err) {
    console.error("[sync] pullUserDatabase failed", {
      userId,
      ms: Date.now() - t0,
      message: err?.message || String(err),
    });
    throw err;
  }
}

export async function reconcileUserDatabase(supabase, userId, incoming) {
  const t0 = Date.now();
  if (!incoming || typeof incoming !== "object") {
    throw new ServiceError("Cuerpo debe incluir { data: AppDatabase }.");
  }
  try {
    const ctx = await getRequestWorkspaceContext(supabase, userId);
    const { db } = normalizeIds(incoming);
    await reconcile(supabase, db, userId, ctx.workspaceId, { teamScope: ctx.teamScope });
    const result = await pullAll(supabase, userId, ctx.workspaceId, { teamScope: ctx.teamScope });
    console.info("[sync] reconcileUserDatabase ok", {
      userId,
      workspaceId: ctx.workspaceId,
      ms: Date.now() - t0,
    });
    return result;
  } catch (err) {
    console.error("[sync] reconcileUserDatabase failed", {
      userId,
      ms: Date.now() - t0,
      message: err?.message || String(err),
    });
    throw err;
  }
}
