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
import {
  localIdsToPurgeAfterMirror,
  setVisibleProspectIds,
} from "@/modulos/expediente/fachada-visibilidad.js";

/**
 * @param {{ purgeNonRemote?: boolean, workspaceId?: string|null }} [opts]
 */
export async function mirrorClientsWithCloud(opts = {}) {
  const { rows, total } = await fetchAllProspectsFromApi();
  const remoteIds = new Set(rows.map((r) => r.id).filter(Boolean));
  if (opts.workspaceId) {
    setVisibleProspectIds(opts.workspaceId, remoteIds);
  }

  const localOnlyBefore = runWithoutOutboundSync(() => {
    const getClient = useDbStore.getState().getClient;
    const saveClient = useDbStore.getState().saveClient;
    for (const row of rows) {
      if (!row?.id) continue;
      const merged = prospectRowToClient(row, getClient(row.id));
      const { pendingCreate: _pc, localOnly: _lo, _localDraft: _ld, ...rest } = merged;
      saveClient(rest, { skipCloud: true });
    }
    return Object.values(useDbStore.getState().db.clients || {}).filter(
      (c) => c?.id && !remoteIds.has(c.id),
    );
  });

  const posted = [];
  const failed = [];
  for (const client of localOnlyBefore) {
    try {
      await persistProspectCreate(client);
      posted.push(client.id);
    } catch (err) {
      const msg = err?.message || String(err);
      if (/duplicate|already exists|unique/i.test(msg)) {
        posted.push(client.id);
      } else {
        failed.push({ id: client.id, error: msg });
        runWithoutOutboundSync(() => {
          const cur = useDbStore.getState().getClient(client.id) || client;
          useDbStore.getState().saveClient(
            { ...cur, pendingCreate: true },
            { skipCloud: true },
          );
        });
      }
    }
  }

  if (opts.purgeNonRemote === true) {
    runWithoutOutboundSync(() => {
      const purgeIds = localIdsToPurgeAfterMirror(
        useDbStore.getState().db.clients,
        remoteIds,
      );
      const deleteClient = useDbStore.getState().deleteClient;
      for (const id of purgeIds) {
        deleteClient(id, { skipCloud: true });
      }
    });
  }

  if (posted.length > 0 || localOnlyBefore.length > 0) {
    markOutboxDirty("clients-mirror");
    useSyncStore.getState().setPendingOutbound(true);
    await requestSyncPush({ reason: "clients-mirror" });
  }

  return {
    remoteTotal: total,
    remoteCount: rows.length,
    remoteIds: [...remoteIds],
    localOnlyCount: localOnlyBefore.length,
    posted,
    failed,
  };
}
