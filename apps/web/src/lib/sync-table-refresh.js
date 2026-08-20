/**
 * Invalidación puntual de Realtime (dashboard): aplica el row del evento
 * al store. No llama GET /sync ni refresca las otras tablas.
 */
import { calKey } from "@/lib/format/dates";
import { prospectRowToClient } from "@/lib/prospects-persist.js";
import { runWithoutOutboundSync } from "@/lib/sync-suspend.js";
import { useDbStore } from "@/stores/db-store";

export const DASHBOARD_TABLES = [
  "prospects",
  "sales",
  "goals",
  "calendar_entries",
  "tool_calculations",
  "activities",
];

/** Rutas REST de cada tabla — un cambio no debe pegar las otras. */
export const TABLE_REST_PATHS = {
  prospects: "/api/v1/prospects",
  sales: "/api/v1/sales",
  goals: "/api/v1/goals",
  calendar_entries: "/api/v1/calendar-entries",
  tool_calculations: "/api/v1/tool-calculations",
  activities: "/api/v1/activities",
};

function cloneDb(db) {
  return JSON.parse(JSON.stringify(db));
}

function isoMs(s) {
  const t = Date.parse(String(s ?? ""));
  return Number.isFinite(t) ? t : Date.now();
}

function applyProspects(db, event, row) {
  if (event === "DELETE") {
    if (row?.id) delete db.clients[row.id];
    return;
  }
  if (!row?.id) return;
  const prev = db.clients[row.id];
  db.clients[row.id] = prospectRowToClient(row, prev);
}

function upsertSale(db, sale, prospectId) {
  const client = prospectId ? db.clients[prospectId] : null;
  if (client) {
    const list = client.sales || [];
    const idx = list.findIndex((s) => s.saleId === sale.saleId);
    if (idx >= 0) list[idx] = { ...list[idx], ...sale };
    else list.push(sale);
    client.sales = list;
    return;
  }
  db.sales = db.sales || {};
  db.sales[sale.saleId] = { ...sale, orphaned: true };
}

function applySales(db, event, row) {
  const id = row?.id;
  if (!id) return;
  if (event === "DELETE") {
    const pid = row.prospect_id;
    if (pid && db.clients[pid]) {
      db.clients[pid].sales = (db.clients[pid].sales || []).filter((s) => s.saleId !== id);
    }
    if (db.sales) delete db.sales[id];
    return;
  }
  upsertSale(db, {
    saleId: id,
    date: row.sale_date,
    vol: Number(row.vol) || 0,
    tours: Number(row.tours) || 1,
    contract: row.contract,
    status: row.status,
    processing: row.processing,
    processDate: row.process_date,
    addProcessingFollowup: !!row.add_processing_followup,
    note: row.note,
    ts: isoMs(row.created_at),
    prospectId: row.prospect_id,
  }, row.prospect_id);
}

function applyActivities(db, event, row) {
  const id = row?.id;
  if (!id) return;
  if (event === "DELETE") {
    const pid = row.prospect_id;
    if (pid && db.clients[pid]) {
      db.clients[pid].activities = (db.clients[pid].activities || []).filter((a) => a.id !== id);
    }
    db.userActivities = (db.userActivities || []).filter((a) => a.id !== id);
    return;
  }
  const activity = {
    id,
    ts: isoMs(row.created_at),
    type: row.type,
    date: row.activity_date,
    title: row.title,
    note: row.note,
    source: row.source,
    saleId: row.sale_id,
    contract: row.contract,
    vol: row.vol,
    tours: row.tours,
  };
  if (row.prospect_id && db.clients[row.prospect_id]) {
    const list = db.clients[row.prospect_id].activities || [];
    const idx = list.findIndex((a) => a.id === id);
    if (idx >= 0) list[idx] = { ...list[idx], ...activity };
    else list.push(activity);
    db.clients[row.prospect_id].activities = list;
  } else {
    const list = db.userActivities || [];
    const idx = list.findIndex((a) => a.id === id);
    if (idx >= 0) list[idx] = { ...list[idx], ...activity };
    else list.push(activity);
    db.userActivities = list;
  }
}

function applyCalendar(db, event, row) {
  const id = row?.id;
  if (!id) return;
  const remove = () => {
    for (const month of Object.values(db.cal || {})) {
      for (const day of Object.keys(month.days || {})) {
        month.days[day] = (month.days[day] || []).filter((e) => e.id !== id);
      }
    }
  };
  if (event === "DELETE") {
    remove();
    return;
  }
  if (!row.entry_date || !/^\d{4}-\d{2}-\d{2}$/.test(row.entry_date)) return;
  const [y, m] = row.entry_date.split("-").map(Number);
  const key = calKey(y, m - 1);
  const day = Number(row.entry_date.slice(8, 10));
  remove();
  const month = db.cal[key] ||= { days: {}, weeks: {} };
  const entry = {
    id,
    t: row.type,
    ts: isoMs(row.created_at),
    note: row.note,
    vol: row.vol,
    tours: row.tours,
    contract: row.contract,
    clientId: row.prospect_id,
    prospectId: row.prospect_id,
    clientName: row.client_name,
    saleId: row.sale_id,
    source: row.source,
    status: row.status,
    processing: row.processing,
    processDate: row.process_date,
    completed: !!row.completed,
    kind: row.kind,
  };
  (month.days[day] ||= []).push(entry);
}

function applyGoals(db, event, row) {
  if (row?.year == null || row?.month == null) return;
  const key = calKey(Number(row.year), Number(row.month));
  if (event === "DELETE") {
    delete db.goals[key];
    return;
  }
  db.goals[key] = {
    vol: Number(row.vol) || 0,
    tours: Number(row.tours) || 0,
    ventas: Number(row.ventas) || 0,
    dias: Number(row.dias) || 0,
    desc: Number(row.descansos) || 0,
    updatedAt: isoMs(row.updated_at),
  };
}

function applyTools(db, event, row) {
  const tool = row?.tool;
  if (!tool) return;
  const stamp = isoMs(row.updated_at);
  if (event === "DELETE") {
    if (row.prospect_id && db.clients[row.prospect_id]?.data) {
      delete db.clients[row.prospect_id].data[tool];
    } else if (!row.prospect_id) {
      delete db.libre[tool];
    }
    return;
  }
  const hasJson = row.data && typeof row.data === "object" && Object.keys(row.data).length > 0;
  const payload = hasJson
    ? { ...row.data, _updatedAt: stamp }
    : { _updatedAt: stamp, _id: row.id, _pending: 1, _stale: 1 };
  if (row.prospect_id && db.clients[row.prospect_id]) {
    (db.clients[row.prospect_id].data ||= {})[tool] = payload;
  } else if (!row.prospect_id) {
    db.libre[tool] = payload;
  }
}

const APPLY = {
  prospects: applyProspects,
  sales: applySales,
  activities: applyActivities,
  calendar_entries: applyCalendar,
  goals: applyGoals,
  tool_calculations: applyTools,
};

/**
 * @param {string} table
 * @param {{ eventType?: string, event?: string, new?: object, old?: object }} payload
 */
export function applyDashboardTableChange(table, payload) {
  const fn = APPLY[table];
  if (!fn) return;
  const event = String(payload?.eventType || payload?.event || "*").toUpperCase();
  const row = event === "DELETE" ? (payload.old || payload.new) : (payload.new || payload.old);
  if (!row) return;
  runWithoutOutboundSync(() => {
    const db = cloneDb(useDbStore.getState().db);
    fn(db, event, row);
    useDbStore.getState().replaceDb(db);
  });
}

export function restPathsNotForTable(table) {
  return Object.entries(TABLE_REST_PATHS)
    .filter(([key]) => key !== table)
    .map(([, path]) => path);
}
