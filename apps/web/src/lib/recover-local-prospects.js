/**
 * Recupera blob local atrapado en el dispositivo → Supabase (workspace activo).
 *
 * 1) Comparar IDs locales vs pull
 * 2) POST /prospects por cada faltante
 * 3) PUT /sync si Outbox dirty, local-ahead o hubo altas
 */
import { loadDatabase } from "@/lib/storage/local-storage-adapter";
import { pullViaApi, reconcileViaApi } from "@/lib/sync-api.js";
import { isEmptyDb, normalizeIds } from "@/lib/data/mappers";
import { localNeedsOutboundPush } from "@/lib/sync-merge.js";
import { clearOutboxAck, isOutboxDirty, markOutboxDirty } from "@/lib/sync-outbox.js";
import { runWithoutOutboundSync } from "@/lib/sync-suspend.js";
import { useDbStore } from "@/stores/db-store";
import { useSyncStore } from "@/stores/sync-store";
import { toast } from "@/lib/toast";

function listLocalClients(db) {
  return Object.values(db?.clients || {}).filter((c) => c?.id);
}

async function postMissingProspect(client) {
  const res = await fetch("/api/v1/prospects", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: client.id,
      prospectCode: client.prospectCode,
      name: client.name1 || client.name,
      name1: client.name1 || client.name,
      name2: client.name2 || null,
      city: client.city || null,
      country: client.country || null,
      phone: client.phone || null,
      email: client.email || null,
      contract: client.contract || null,
      status: client.status || null,
      tourDate: client.tourDate || null,
      processDate: client.processDate || null,
      processAmount: client.processAmount || 0,
      note: client.note || null,
      tipo_tour: client.tipo_tour || null,
      tour_cuantificable: client.tour_cuantificable,
      completedExpedient: client.completedExpedient,
      quickExpedient: client.quickExpedient,
    }),
  });
  if (res.ok || res.status === 409) return { ok: true, id: client.id };
  const body = await res.json().catch(() => ({}));
  const msg = String(body.error || "");
  if (/duplicate|already exists|unique/i.test(msg)) {
    return { ok: true, id: client.id, already: true };
  }
  return { ok: false, id: client.id, error: msg || `HTTP ${res.status}` };
}

/**
 * @returns {Promise<{
 *   attempted: boolean,
 *   localOnlyIds: string[],
 *   posted: string[],
 *   failed: Array<{ id: string, error: string }>,
 *   reconciled: boolean,
 *   error?: string,
 * }>}
 */
export async function recoverLocalProspectsToCloud() {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return {
      attempted: false,
      localOnlyIds: [],
      posted: [],
      failed: [],
      reconciled: false,
      error: "offline",
    };
  }

  let local = useDbStore.getState().db;
  if (isEmptyDb(local)) local = loadDatabase();
  const localClients = listLocalClients(local);
  const outboxDirty = isOutboxDirty();

  if (
    !localClients.length
    && !outboxDirty
    && !localNeedsOutboundPush(local, { clients: {}, cal: {}, goals: {}, libre: {}, sales: {} })
  ) {
    return {
      attempted: false,
      localOnlyIds: [],
      posted: [],
      failed: [],
      reconciled: false,
    };
  }

  let cloudDb = { clients: {}, cal: {}, goals: {}, libre: {}, sales: {} };
  try {
    cloudDb = (await pullViaApi()) || cloudDb;
  } catch (err) {
    markOutboxDirty("recovery-pull-failed");
    useSyncStore.getState().setPendingOutbound(true);
    return {
      attempted: true,
      localOnlyIds: localClients.map((c) => c.id),
      posted: [],
      failed: [],
      reconciled: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const remoteIds = new Set(Object.keys(cloudDb.clients || {}));
  const localOnly = localClients.filter((c) => !remoteIds.has(c.id));
  const localOnlyIds = localOnly.map((c) => c.id);

  const posted = [];
  const failed = [];
  for (const client of localOnly) {
    try {
      const result = await postMissingProspect(client);
      if (result.ok) posted.push(client.id);
      else failed.push({ id: client.id, error: result.error || "error" });
    } catch (err) {
      failed.push({
        id: client.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const needsFullSync =
    outboxDirty
    || localOnlyIds.length > 0
    || localNeedsOutboundPush(local, cloudDb)
    || failed.length > 0;

  let reconciled = false;
  let error;
  if (needsFullSync) {
    try {
      const storeDb = useDbStore.getState().db;
      const toPush = isEmptyDb(storeDb) ? local : storeDb;
      const { db: norm } = normalizeIds(toPush);
      const remote = await reconcileViaApi(norm);
      if (remote) {
        const localSettings = useDbStore.getState().db.settings;
        runWithoutOutboundSync(() => {
          useDbStore.getState().replaceDb({
            ...remote,
            settings: { ...(remote.settings || {}), ...localSettings },
            pendingDeletes: {
              prospects: [],
              sales: [],
              calendar_entries: [],
              activities: [],
              tool_calculations: [],
            },
          });
        });
      }
      clearOutboxAck();
      useSyncStore.getState().setPendingOutbound(false);
      reconciled = true;
    } catch (err) {
      markOutboxDirty("recovery-put-failed");
      useSyncStore.getState().setPendingOutbound(true);
      error = err instanceof Error ? err.message : String(err);
    }
  }

  if (localOnlyIds.length > 0 && reconciled && failed.length === 0) {
    toast.success(
      localOnlyIds.length === 1
        ? "1 expediente del teléfono se guardó en la nube"
        : `${localOnlyIds.length} expedientes del teléfono se guardaron en la nube`,
    );
  } else if (failed.length > 0) {
    toast.error(
      `No se pudieron subir ${failed.length} expediente(s). Revisa la conexión e intenta de nuevo.`,
    );
  } else if (reconciled && outboxDirty && !localOnlyIds.length) {
    // Edits/tools pendientes flusheados sin altas nuevas — silencioso o info breve
    useSyncStore.getState().setSynced();
  }

  return {
    attempted: true,
    localOnlyIds,
    posted,
    failed,
    reconciled,
    error,
  };
}

/** Alias semántico: recovery del blob completo, no solo prospects. */
export const recoverLocalBlobToCloud = recoverLocalProspectsToCloud;
