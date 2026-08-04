/**
 * Merge inbound (nube) + local para sync multi-dispositivo.
 * - Filas solo locales se conservan (aún no empujadas).
 * - En conflicto por id, gana el updatedAt/ts más reciente (LWW).
 */
import {
  emptyPendingDeletes,
  hasPendingDeletes,
  mergePendingDeletes,
} from "@/lib/sync-pending-deletes.js";

function tsOfClient(c) {
  return Number(c?.updatedAt || c?.createdAt || 0) || 0;
}

function tsOfSale(s) {
  return Number(s?.updatedAt || s?.ts || 0) || 0;
}

function tsOfActivity(a) {
  return Number(a?.updatedAt || a?.ts || 0) || 0;
}

function tsOfEntry(e) {
  return Number(e?.updatedAt || e?.ts || 0) || 0;
}

function tsOfGoal(g) {
  return Number(g?.updatedAt || 0) || 0;
}

function toolBucketTs(bucket) {
  if (!bucket || typeof bucket !== "object") return 0;
  const n = Number(bucket._updatedAt);
  return Number.isFinite(n) ? n : 0;
}

function mergeToolBuckets(localBucket, remoteBucket) {
  const l = localBucket && typeof localBucket === "object" ? localBucket : null;
  const r = remoteBucket && typeof remoteBucket === "object" ? remoteBucket : null;
  if (!l && !r) return {};
  if (!l) return { ...r };
  if (!r) return { ...l };
  return toolBucketTs(l) >= toolBucketTs(r) ? { ...l } : { ...r };
}

function mergeClients(localClients, remoteClients) {
  const out = { ...remoteClients };
  for (const [id, local] of Object.entries(localClients || {})) {
    const remote = out[id];
    if (!remote) {
      out[id] = local;
      continue;
    }
    if (tsOfClient(local) >= tsOfClient(remote)) {
      const merged = { ...local };
      // Conservar tools del lado más nuevo por bucket
      const localData = local.data || {};
      const remoteData = remote.data || {};
      merged.data = {
        survey: mergeToolBuckets(localData.survey, remoteData.survey),
        vacaciones: mergeToolBuckets(localData.vacaciones, remoteData.vacaciones),
        worksheet: mergeToolBuckets(localData.worksheet, remoteData.worksheet),
      };
      // Sales / activities: unión por id con LWW
      const salesById = new Map();
      for (const s of remote.sales || []) {
        if (s?.saleId) salesById.set(s.saleId, s);
      }
      for (const s of local.sales || []) {
        if (!s?.saleId) continue;
        const prev = salesById.get(s.saleId);
        if (!prev || tsOfSale(s) >= tsOfSale(prev)) salesById.set(s.saleId, s);
      }
      merged.sales = [...salesById.values()];

      const actsById = new Map();
      for (const a of remote.activities || []) {
        if (a?.id) actsById.set(a.id, a);
      }
      for (const a of local.activities || []) {
        if (!a?.id) continue;
        const prev = actsById.get(a.id);
        if (!prev || tsOfActivity(a) >= tsOfActivity(prev)) actsById.set(a.id, a);
      }
      merged.activities = [...actsById.values()];
      out[id] = merged;
    } else {
      const merged = { ...remote };
      const localData = local.data || {};
      const remoteData = remote.data || {};
      merged.data = {
        survey: mergeToolBuckets(localData.survey, remoteData.survey),
        vacaciones: mergeToolBuckets(localData.vacaciones, remoteData.vacaciones),
        worksheet: mergeToolBuckets(localData.worksheet, remoteData.worksheet),
      };
      const salesById = new Map();
      for (const s of remote.sales || []) {
        if (s?.saleId) salesById.set(s.saleId, s);
      }
      for (const s of local.sales || []) {
        if (!s?.saleId) continue;
        const prev = salesById.get(s.saleId);
        if (!prev || tsOfSale(s) >= tsOfSale(prev)) salesById.set(s.saleId, s);
      }
      merged.sales = [...salesById.values()];
      const actsById = new Map();
      for (const a of remote.activities || []) {
        if (a?.id) actsById.set(a.id, a);
      }
      for (const a of local.activities || []) {
        if (!a?.id) continue;
        const prev = actsById.get(a.id);
        if (!prev || tsOfActivity(a) >= tsOfActivity(prev)) actsById.set(a.id, a);
      }
      merged.activities = [...actsById.values()];
      out[id] = merged;
    }
  }
  return out;
}

function mergeSalesArchive(localSales, remoteSales) {
  const out = { ...(remoteSales || {}) };
  for (const [id, local] of Object.entries(localSales || {})) {
    const remote = out[id];
    if (!remote || tsOfSale(local) >= tsOfSale(remote)) out[id] = local;
  }
  return out;
}

function mergeCal(localCal, remoteCal) {
  const out = JSON.parse(JSON.stringify(remoteCal || {}));
  for (const [key, month] of Object.entries(localCal || {})) {
    if (!out[key]) out[key] = { days: {}, weeks: {} };
    for (const [dayStr, entries] of Object.entries(month.days || {})) {
      const day = Number(dayStr);
      const byId = new Map();
      for (const e of out[key].days?.[day] || []) {
        if (e?.id) byId.set(e.id, e);
      }
      for (const e of entries || []) {
        if (!e?.id) continue;
        const prev = byId.get(e.id);
        if (!prev || tsOfEntry(e) >= tsOfEntry(prev)) byId.set(e.id, e);
      }
      // Entradas locales sin id remoto (aún no sync) — por id nuevo ya cubierto;
      // si no tenían id no deberían existir tras normalizeIds.
      if (!out[key].days) out[key].days = {};
      out[key].days[day] = [...byId.values()];
      if (!out[key].days[day].length) delete out[key].days[day];
    }
  }
  return out;
}

function mergeGoals(localGoals, remoteGoals) {
  const out = { ...(remoteGoals || {}) };
  for (const [key, local] of Object.entries(localGoals || {})) {
    const remote = out[key];
    if (!remote || tsOfGoal(local) >= tsOfGoal(remote)) out[key] = { ...local };
  }
  return out;
}

function mergeLibre(localLibre, remoteLibre) {
  const tools = new Set([
    ...Object.keys(localLibre || {}),
    ...Object.keys(remoteLibre || {}),
  ]);
  const out = {};
  for (const tool of tools) {
    out[tool] = mergeToolBuckets(localLibre?.[tool], remoteLibre?.[tool]);
  }
  return out;
}

function mergeUserActivities(localList, remoteList) {
  const byId = new Map();
  for (const a of remoteList || []) {
    if (a?.id) byId.set(a.id, a);
  }
  for (const a of localList || []) {
    if (!a?.id) continue;
    const prev = byId.get(a.id);
    if (!prev || tsOfActivity(a) >= tsOfActivity(prev)) byId.set(a.id, a);
  }
  return [...byId.values()].sort((a, b) => (a.ts || 0) - (b.ts || 0));
}

/**
 * True si el local tiene filas que la nube no tiene o versiones más nuevas.
 * Indica que hay que hacer PUT tras un pull/merge.
 */
export function localNeedsOutboundPush(local, remote) {
  if (!local || typeof local !== "object") return false;
  if (hasPendingDeletes(local)) return true;
  const remoteClients = remote?.clients || {};
  for (const [id, client] of Object.entries(local.clients || {})) {
    const remoteClient = remoteClients[id];
    if (!remoteClient) return true;
    if (tsOfClient(client) > tsOfClient(remoteClient)) return true;
    const localSales = client.sales || [];
    const remoteSalesById = new Map((remoteClient.sales || []).map((s) => [s.saleId, s]));
    for (const sale of localSales) {
      if (!sale?.saleId) continue;
      const rs = remoteSalesById.get(sale.saleId);
      if (!rs || tsOfSale(sale) > tsOfSale(rs)) return true;
    }
    for (const tool of ["survey", "vacaciones", "worksheet"]) {
      const lb = client.data?.[tool];
      const rb = remoteClient.data?.[tool];
      if (isNonEmptyTool(lb) && (!isNonEmptyTool(rb) || toolBucketTs(lb) > toolBucketTs(rb))) {
        return true;
      }
    }
  }
  for (const [id, sale] of Object.entries(local.sales || {})) {
    const remoteSale = remote?.sales?.[id];
    if (!remoteSale || tsOfSale(sale) > tsOfSale(remoteSale)) return true;
  }
  for (const tool of Object.keys(local.libre || {})) {
    const lb = local.libre[tool];
    const rb = remote?.libre?.[tool];
    if (isNonEmptyTool(lb) && (!isNonEmptyTool(rb) || toolBucketTs(lb) > toolBucketTs(rb))) {
      return true;
    }
  }
  return false;
}

function isNonEmptyTool(bucket) {
  if (!bucket || typeof bucket !== "object") return false;
  return Object.keys(bucket).some((k) => k !== "_updatedAt");
}

/**
 * @param {import("@/lib/storage/types").AppDatabase} local
 * @param {import("@/lib/storage/types").AppDatabase} remote
 * @param {{ localSettings?: object }} [opts]
 */
export function mergeSyncDatabases(local, remote, opts = {}) {
  const baseRemote = remote && typeof remote === "object" ? remote : {};
  const baseLocal = local && typeof local === "object" ? local : {};
  const localSettings = opts.localSettings ?? baseLocal.settings ?? {};

  return {
    clients: mergeClients(baseLocal.clients, baseRemote.clients),
    sales: mergeSalesArchive(baseLocal.sales, baseRemote.sales),
    cal: mergeCal(baseLocal.cal, baseRemote.cal),
    goals: mergeGoals(baseLocal.goals, baseRemote.goals),
    libre: mergeLibre(baseLocal.libre, baseRemote.libre),
    userActivities: mergeUserActivities(baseLocal.userActivities, baseRemote.userActivities),
    settings: { ...(baseRemote.settings || {}), ...localSettings },
    pendingDeletes: mergePendingDeletes(
      baseLocal.pendingDeletes || emptyPendingDeletes(),
      baseRemote.pendingDeletes,
    ),
  };
}
