/**
 * Persistencia online-first para entidades distintas de expedientes.
 * Expedientes: ver prospects-persist.js (fuente única).
 */
import { markOutboxDirty } from "@/lib/sync-outbox.js";
import { requestSyncPush } from "@/lib/sync-outbound.js";
import {
  isCloudAvailable,
  persistProspectCreate,
  persistProspectDelete,
  persistProspectUpdate,
  persistProspectUpsert,
} from "@/lib/prospects-persist.js";

export { isCloudAvailable, persistProspectCreate, persistProspectDelete, persistProspectUpdate, persistProspectUpsert };

const API = "/api/v1";

async function apiJson(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(body != null ? { "Content-Type": "application/json" } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

function queueFallback(reason) {
  markOutboxDirty(reason);
  void requestSyncPush({ reason });
}

function stripToolMeta(data) {
  if (!data || typeof data !== "object") return {};
  const out = { ...data };
  delete out._updatedAt;
  return out;
}

function saleBody(clientId, sale) {
  return {
    id: sale.saleId,
    saleId: sale.saleId,
    prospectId: sale.prospectId || clientId,
    date: sale.date,
    sale_date: sale.date,
    vol: sale.vol,
    tours: sale.tours,
    contract: sale.contract,
    status: sale.status,
    processing: sale.processing,
    processDate: sale.processDate,
    addProcessingFollowup: sale.addProcessingFollowup,
    note: sale.note,
  };
}

function activityBody(clientId, activity) {
  return {
    id: activity.id,
    prospectId: clientId || null,
    saleId: activity.saleId || null,
    type: activity.type,
    title: activity.title,
    note: activity.note,
    date: activity.date,
    source: activity.source,
    vol: activity.vol,
    tours: activity.tours,
    contract: activity.contract,
  };
}

function calBody(entry, entryDate) {
  return {
    id: entry.id,
    type: entry.t,
    t: entry.t,
    entry_date: entryDate,
    date: entryDate,
    prospectId: entry.prospectId || entry.clientId || null,
    clientId: entry.clientId || entry.prospectId || null,
    saleId: entry.saleId || null,
    note: entry.note,
    vol: entry.vol,
    tours: entry.tours,
    contract: entry.contract,
    source: entry.source,
    status: entry.status,
    processing: entry.processing,
    processDate: entry.processDate,
    completed: entry.completed,
    kind: entry.kind,
    clientName: entry.clientName,
  };
}

export async function persistSaleUpsert(clientId, sale) {
  if (!sale?.saleId) return { ok: false };
  try {
    await apiJson("PATCH", `/sales/${sale.saleId}`, saleBody(clientId, sale));
    return { ok: true };
  } catch (err) {
    if (err.status === 404) {
      await apiJson("POST", "/sales", saleBody(clientId, sale));
      return { ok: true };
    }
    throw err;
  }
}

export async function persistSaleDelete(saleId) {
  await apiJson("DELETE", `/sales/${saleId}`);
  return { ok: true };
}

export async function persistActivityUpsert(clientId, activity) {
  if (!activity?.id || !activity.type) return { ok: false };
  try {
    await apiJson("PATCH", `/activities/${activity.id}`, activityBody(clientId, activity));
    return { ok: true };
  } catch (err) {
    if (err.status === 404) {
      await apiJson("POST", "/activities", activityBody(clientId, activity));
      return { ok: true };
    }
    throw err;
  }
}

export async function persistCalendarUpsert(entry, entryDate) {
  if (!entry?.id || !entryDate) return { ok: false };
  try {
    await apiJson("PATCH", `/calendar-entries/${entry.id}`, calBody(entry, entryDate));
    return { ok: true };
  } catch (err) {
    if (err.status === 404) {
      await apiJson("POST", "/calendar-entries", calBody(entry, entryDate));
      return { ok: true };
    }
    throw err;
  }
}

export async function persistCalendarDelete(id) {
  await apiJson("DELETE", `/calendar-entries/${id}`);
  return { ok: true };
}

export async function persistGoalUpsert(year, month, goal) {
  await apiJson("PUT", "/goals", {
    year,
    month,
    vol: goal.vol ?? 0,
    tours: goal.tours ?? 0,
    ventas: goal.ventas ?? 0,
    dias: goal.dias ?? 0,
    descansos: goal.desc ?? goal.descansos ?? 0,
  });
  return { ok: true };
}

export async function persistToolUpsert(tool, mode, data, clientId) {
  const payload = stripToolMeta(data);
  const prospectId = mode === "client" && clientId ? clientId : "libre";
  if (!Object.keys(payload).length) {
    const q = prospectId === "libre" ? "prospect_id=libre" : `prospect_id=${prospectId}`;
    await apiJson("DELETE", `/tool-calculations?tool=${encodeURIComponent(tool)}&${q}`);
    return { ok: true };
  }
  await apiJson("PUT", "/tool-calculations", {
    tool,
    prospect_id: prospectId,
    prospectId,
    data: payload,
  });
  return { ok: true };
}

/**
 * @param {{ type: string, reason?: string, run: () => Promise<{ ok?: boolean }> }} op
 */
export async function runCloudPersist(op) {
  if (!isCloudAvailable()) {
    queueFallback(op.reason || `offline:${op.type}`);
    return { ok: false, offline: true };
  }
  try {
    const result = await op.run();
    return { ok: true, ...result };
  } catch (err) {
    console.warn(`[cloud-persist] ${op.type}:`, err?.message || err);
    queueFallback(op.reason || `error:${op.type}`);
    return { ok: false, error: err };
  }
}

/** Fire-and-forget persistencia inmediata (online) o cola (offline). */
export function scheduleCloudPersist(op) {
  void runCloudPersist(op);
}

/** Encuentra entradas de agenda por saleId o id. */
export function findCalEntries(db, { saleId, entryId } = {}) {
  const hits = [];
  for (const [key, month] of Object.entries(db.cal || {})) {
    const [y, m] = key.split("-").map(Number);
    if (!y || Number.isNaN(m)) continue;
    for (const [dayStr, entries] of Object.entries(month.days || {})) {
      const day = Number(dayStr);
      const entryDate = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      for (const entry of entries || []) {
        if (entryId && entry.id === entryId) hits.push({ entry, entryDate });
        else if (saleId && entry.saleId === saleId) hits.push({ entry, entryDate });
      }
    }
  }
  return hits;
}

/** Sincroniza efectos colaterales de una venta (agenda + actividad). */
export async function persistSaleBundle(clientId, saleId, db) {
  const client = db.clients[clientId];
  if (!client) return;
  const sale = (client.sales || []).find((s) => s.saleId === saleId);
  if (sale) await persistSaleUpsert(clientId, sale);
  await persistProspectUpsert(client);
  const activity = (client.activities || []).find((a) => a.saleId === saleId);
  if (activity) await persistActivityUpsert(clientId, activity);
  for (const { entry, entryDate } of findCalEntries(db, { saleId })) {
    await persistCalendarUpsert(entry, entryDate);
  }
}

export function scheduleSaleBundle(clientId, saleId) {
  scheduleCloudPersist({
    type: "sale-bundle",
    reason: "sale",
    run: async () => {
      const { useDbStore } = await import("@/stores/db-store");
      const db = useDbStore.getState().db;
      await persistSaleBundle(clientId, saleId, db);
      return { ok: true };
    },
  });
}
