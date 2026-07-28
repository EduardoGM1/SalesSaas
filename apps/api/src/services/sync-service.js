import { pullAll, reconcile } from "@salesapp/shared/data/sync.js";
import { normalizeIds } from "@salesapp/shared/data/mappers.js";
import { ServiceError } from "../lib/service-error.js";
import { getRequestWorkspaceContext } from "../lib/workspace-scope.js";

export async function pullUserDatabase(supabase, userId) {
  const ctx = await getRequestWorkspaceContext(supabase, userId);
  return pullAll(supabase, userId, ctx.workspaceId, { teamScope: ctx.teamScope });
}

export async function reconcileUserDatabase(supabase, userId, incoming) {
  if (!incoming || typeof incoming !== "object") {
    throw new ServiceError("Cuerpo debe incluir { data: AppDatabase }.");
  }
  const ctx = await getRequestWorkspaceContext(supabase, userId);
  const { db } = normalizeIds(incoming);
  await reconcile(supabase, db, userId, ctx.workspaceId, { teamScope: ctx.teamScope });
  return pullAll(supabase, userId, ctx.workspaceId, { teamScope: ctx.teamScope });
}
