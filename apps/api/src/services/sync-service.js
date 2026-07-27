import { pullAll, reconcile } from "@salesapp/shared/data/sync.js";
import { normalizeIds } from "@salesapp/shared/data/mappers.js";
import { ServiceError } from "../lib/service-error.js";
import { getRequestWorkspaceId } from "../lib/workspace-scope.js";

export async function pullUserDatabase(supabase, userId) {
  const workspaceId = await getRequestWorkspaceId(supabase, userId);
  return pullAll(supabase, userId, workspaceId);
}

export async function reconcileUserDatabase(supabase, userId, incoming) {
  if (!incoming || typeof incoming !== "object") {
    throw new ServiceError("Cuerpo debe incluir { data: AppDatabase }.");
  }
  const workspaceId = await getRequestWorkspaceId(supabase, userId);
  const { db } = normalizeIds(incoming);
  await reconcile(supabase, db, userId, workspaceId);
  return pullAll(supabase, userId, workspaceId);
}
