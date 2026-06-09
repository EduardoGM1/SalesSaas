import { pullAll, reconcile } from "@salesapp/shared/data/sync.js";
import { normalizeIds } from "@salesapp/shared/data/mappers.js";
import { ServiceError } from "../lib/service-error.js";

export async function pullUserDatabase(supabase, userId) {
  return pullAll(supabase, userId);
}

export async function reconcileUserDatabase(supabase, userId, incoming) {
  if (!incoming || typeof incoming !== "object") {
    throw new ServiceError("Cuerpo debe incluir { data: AppDatabase }.");
  }
  const { db } = normalizeIds(incoming);
  await reconcile(supabase, db, userId);
  return pullAll(supabase, userId);
}
