/**
 * Espejo Clientes: API REST como fuente de verdad del listado +
 * subida de expedientes solo-locales que aún no están en BD.
 */
import { useDbStore } from "@/stores/db-store";
import { runWithoutOutboundSync } from "@/lib/sync-suspend.js";
import { markOutboxDirty } from "@/lib/sync-outbox.js";
import { requestSyncPush } from "@/lib/sync-outbound.js";
import { useSyncStore } from "@/stores/sync-store";
import {
  fetchAllProspectsFromApi,
  persistProspectCreate,
  prospectRowToClient,
} from "@/lib/prospects-persist.js";

export async function mirrorClientsWithCloud() {
  const { rows, total } = await fetchAllProspectsFromApi();
  const remoteIds = new Set(rows.map((r) => r.id).filter(Boolean));

  runWithoutOutboundSync(() => {
    const getClient = useDbStore.getState().getClient;
    const saveClient = useDbStore.getState().saveClient;
    for (const row of rows) {
      if (!row?.id) continue;
      saveClient(prospectRowToClient(row, getClient(row.id)), { skipCloud: true });
    }
  });

  const localClients = Object.values(useDbStore.getState().db.clients || {});
  const localOnly = localClients.filter((c) => c?.id && !remoteIds.has(c.id));

  const posted = [];
  const failed = [];
  for (const client of localOnly) {
    try {
      await persistProspectCreate(client);
      posted.push(client.id);
    } catch (err) {
      const msg = err?.message || String(err);
      if (/duplicate|already exists|unique/i.test(msg)) {
        posted.push(client.id);
      } else {
        failed.push({ id: client.id, error: msg });
      }
    }
  }

  if (posted.length > 0 || localOnly.length > 0) {
    markOutboxDirty("clients-mirror");
    useSyncStore.getState().setPendingOutbound(true);
    await requestSyncPush({ reason: "clients-mirror" });
  }

  return {
    remoteTotal: total,
    remoteCount: rows.length,
    localOnlyCount: localOnly.length,
    posted,
    failed,
  };
}
