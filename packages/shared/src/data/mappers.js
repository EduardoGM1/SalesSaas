import { calKey } from "../format/dates.js";
import { generateActivityId, generateEntryId, generateProspectCode, generateSaleId } from "../ids.js";
import {
  emptyDatabase
} from "../storage/types.js";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = /* @__PURE__ */ new Set([
  "venta",
  "bback",
  "procesable",
  "no-procesable",
  "perdido",
  "cerrado",
  "procesado"
]);
const TOOLS = ["survey", "vacaciones", "worksheet"];
function isUuid(v) {
  return typeof v === "string" && UUID_RE.test(v);
}
function sanitizeStatus(s) {
  return typeof s === "string" && STATUSES.has(s) ? s : null;
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function intOr(v, fallback) {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : fallback;
}
function toDateOrNull(v) {
  if (typeof v !== "string") return null;
  const s = v.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
function tsToISO(ms) {
  const n = Number(ms);
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : void 0;
}
function isoToMs(s) {
  const t = Date.parse(String(s ?? ""));
  return Number.isFinite(t) ? t : Date.now();
}
function nonEmptyData(d) {
  if (!d || typeof d !== "object") return null;
  const obj = d;
  return Object.keys(obj).length > 0 ? obj : null;
}
function parseGoalKey(key) {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  return { year: y, month: m - 1 };
}
function normalizeIds(db) {
  const next = JSON.parse(JSON.stringify(db));
  let changed = false;
  const clientIdMap = /* @__PURE__ */ new Map();
  const saleIdMap = /* @__PURE__ */ new Map();
  const newClients = {};
  for (const [oldId, client] of Object.entries(next.clients)) {
    const newId = isUuid(oldId) ? oldId : generateProspectId();
    if (newId !== oldId) changed = true;
    clientIdMap.set(oldId, newId);
    client.id = newId;
    if (!client.prospectId || client.prospectId === oldId || !isUuid(client.prospectId)) {
      client.prospectId = newId;
    }
    if (!client.prospectCode) client.prospectCode = generateProspectCode(newId);
    for (const sale of client.sales ?? []) {
      const oldSale = sale.saleId;
      const newSale = isUuid(oldSale) ? oldSale : generateSaleId();
      if (newSale !== oldSale) changed = true;
      if (oldSale) saleIdMap.set(oldSale, newSale);
      sale.saleId = newSale;
      sale.prospectId = newId;
    }
    for (const act of client.activities ?? []) {
      if (!isUuid(act.id)) {
        act.id = generateActivityId();
        changed = true;
      }
    }
    newClients[newId] = client;
  }
  next.clients = newClients;
  for (const client of Object.values(next.clients)) {
    for (const act of client.activities ?? []) {
      if (act.saleId && saleIdMap.has(act.saleId)) act.saleId = saleIdMap.get(act.saleId);
    }
  }
  if (!next.sales) next.sales = {};
  const newSales = {};
  for (const [oldSaleId, sale] of Object.entries(next.sales)) {
    const newSaleId = isUuid(oldSaleId) ? oldSaleId : generateSaleId();
    if (newSaleId !== oldSaleId) changed = true;
    if (oldSaleId) saleIdMap.set(oldSaleId, newSaleId);
    sale.saleId = newSaleId;
    if (sale.formerClientId && clientIdMap.has(sale.formerClientId)) {
      sale.formerClientId = clientIdMap.get(sale.formerClientId);
    }
    newSales[newSaleId] = sale;
  }
  next.sales = newSales;
  for (const month of Object.values(next.cal)) {
    for (const entries of Object.values(month.days)) {
      for (const e of entries) {
        if (!isUuid(e.id)) {
          e.id = generateEntryId();
          changed = true;
        }
        if (e.clientId && clientIdMap.has(e.clientId)) e.clientId = clientIdMap.get(e.clientId);
        if (e.prospectId && clientIdMap.has(e.prospectId)) e.prospectId = clientIdMap.get(e.prospectId);
        if (e.saleId && saleIdMap.has(e.saleId)) e.saleId = saleIdMap.get(e.saleId);
      }
    }
  }
  for (const ua of next.userActivities ?? []) {
    if (!isUuid(ua.id)) {
      ua.id = generateActivityId();
      changed = true;
    }
  }
  return { db: next, changed };
}
function generateProspectId() {
  return generateSaleId();
}
function dbToRows(db, userId) {
  const prospects = [];
  const sales = [];
  const calendar_entries = [];
  const goals = [];
  const activities = [];
  const tool_calculations = [];
  const validProspectIds = /* @__PURE__ */ new Set();
  const validSaleIds = /* @__PURE__ */ new Set();
  for (const client of Object.values(db.clients)) {
    if (isUuid(client.id)) validProspectIds.add(client.id);
    for (const sale of client.sales ?? []) {
      if (isUuid(sale.saleId)) validSaleIds.add(sale.saleId);
    }
  }
  for (const sale of Object.values(db.sales ?? {})) {
    if (isUuid(sale.saleId)) validSaleIds.add(sale.saleId);
  }
  for (const client of Object.values(db.clients)) {
    if (!isUuid(client.id)) continue;
    prospects.push({
      id: client.id,
      user_id: userId,
      prospect_code: client.prospectCode || generateProspectCode(client.id),
      name: client.name ?? null,
      name1: client.name1 ?? null,
      name2: client.name2 ?? null,
      occupation1: client.occupation1 ?? null,
      occupation2: client.occupation2 ?? null,
      city: client.city ?? null,
      country: client.country ?? null,
      phone: client.phone ?? null,
      email: client.email ?? null,
      contract: client.contract ?? null,
      status: sanitizeStatus(client.status),
      tour_date: toDateOrNull(client.tourDate),
      process_date: toDateOrNull(client.processDate),
      process_amount: num(client.processAmount),
      note: client.note ?? null,
      completed: !!client.completedExpedient,
      quick_expedient: !!client.quickExpedient,
      created_at: tsToISO(client.createdAt)
    });
    for (const sale of client.sales ?? []) {
      if (!isUuid(sale.saleId)) continue;
      sales.push({
        id: sale.saleId,
        user_id: userId,
        prospect_id: client.id,
        sale_date: toDateOrNull(sale.date) ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
        vol: num(sale.vol),
        tours: intOr(sale.tours, 1),
        contract: sale.contract ?? null,
        status: sanitizeStatus(sale.status),
        processing: sale.processing ?? (sale.status === "no-procesable" ? "pendiente" : "procesable"),
        process_date: toDateOrNull(sale.processDate),
        add_processing_followup: !!sale.addProcessingFollowup,
        note: sale.note ?? null,
        created_at: tsToISO(sale.ts)
      });
    }
    for (const act of client.activities ?? []) {
      if (!isUuid(act.id)) continue;
      activities.push({
        id: act.id,
        user_id: userId,
        prospect_id: client.id,
        sale_id: act.saleId && validSaleIds.has(act.saleId) ? act.saleId : null,
        type: act.type || "nota",
        title: act.title ?? null,
        note: act.note ?? null,
        activity_date: toDateOrNull(act.date),
        source: act.source ?? null,
        vol: act.vol != null ? num(act.vol) : null,
        tours: act.tours != null ? intOr(act.tours, 0) : null,
        contract: act.contract ?? null,
        created_at: tsToISO(act.ts)
      });
    }
    for (const tool of TOOLS) {
      const data = nonEmptyData(client.data?.[tool]);
      if (data) tool_calculations.push({ user_id: userId, prospect_id: client.id, tool, data });
    }
  }
  for (const sale of Object.values(db.sales ?? {})) {
    if (!isUuid(sale.saleId)) continue;
    const formerId = sale.formerClientId && validProspectIds.has(sale.formerClientId) ? sale.formerClientId : null;
    sales.push({
      id: sale.saleId,
      user_id: userId,
      prospect_id: formerId,
      prospect_name: sale.clientName ?? null,
      sale_date: toDateOrNull(sale.date) ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
      vol: num(sale.vol),
      tours: intOr(sale.tours, 1),
      contract: sale.contract ?? null,
      status: sanitizeStatus(sale.status),
      processing: sale.processing ?? (sale.status === "no-procesable" ? "pendiente" : "procesable"),
      process_date: toDateOrNull(sale.processDate),
      add_processing_followup: !!sale.addProcessingFollowup,
      note: sale.note ?? null,
      created_at: tsToISO(sale.ts)
    });
  }
  for (const [key, month] of Object.entries(db.cal)) {
    for (const [dayStr, entries] of Object.entries(month.days)) {
      const day = Number(dayStr);
      const entry_date = `${key}-${String(day).padStart(2, "0")}`;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry_date)) continue;
      for (const e of entries) {
        if (!isUuid(e.id)) continue;
        const pid = e.clientId && validProspectIds.has(e.clientId) ? e.clientId : e.prospectId && validProspectIds.has(e.prospectId) ? e.prospectId : null;
        calendar_entries.push({
          id: e.id,
          user_id: userId,
          prospect_id: pid,
          sale_id: e.saleId && validSaleIds.has(e.saleId) ? e.saleId : null,
          type: e.t,
          entry_date,
          note: e.note ?? null,
          vol: e.vol != null ? num(e.vol) : null,
          tours: e.tours != null ? intOr(e.tours, 0) : null,
          contract: e.contract ?? null,
          source: e.source ?? null,
          status: sanitizeStatus(e.status),
          processing: e.processing ?? null,
          process_date: toDateOrNull(e.processDate),
          completed: !!e.completed,
          kind: e.kind ?? null,
          client_name: e.clientName ?? null,
          created_at: tsToISO(e.ts)
        });
      }
    }
  }
  for (const [key, goal] of Object.entries(db.goals)) {
    const parsed = parseGoalKey(key);
    if (!parsed) continue;
    goals.push({
      user_id: userId,
      year: parsed.year,
      month: parsed.month,
      vol: num(goal.vol),
      tours: intOr(goal.tours, 0),
      ventas: intOr(goal.ventas, 0),
      dias: intOr(goal.dias, 0),
      descansos: intOr(goal.desc, 0),
      updated_at: tsToISO(goal.updatedAt)
    });
  }
  for (const tool of TOOLS) {
    const data = nonEmptyData(db.libre[tool]);
    if (data) tool_calculations.push({ user_id: userId, prospect_id: null, tool, data });
  }
  return { prospects, sales, calendar_entries, goals, activities, tool_calculations };
}
function rowsToDb(rows) {
  const db = emptyDatabase();
  for (const p of rows.prospects) {
    const client = {
      id: p.id,
      prospectId: p.id,
      prospectCode: p.prospect_code,
      name: p.name ?? void 0,
      name1: p.name1 ?? void 0,
      name2: p.name2 ?? void 0,
      occupation1: p.occupation1 ?? void 0,
      occupation2: p.occupation2 ?? void 0,
      city: p.city ?? void 0,
      country: p.country ?? void 0,
      phone: p.phone ?? void 0,
      email: p.email ?? void 0,
      contract: p.contract ?? void 0,
      status: p.status ?? void 0,
      tourDate: p.tour_date ?? void 0,
      processDate: p.process_date ?? void 0,
      processAmount: p.process_amount != null ? num(p.process_amount) : void 0,
      note: p.note ?? void 0,
      completedExpedient: !!p.completed,
      quickExpedient: !!p.quick_expedient,
      createdAt: isoToMs(p.created_at),
      createdYmd: p.created_at ? String(p.created_at).slice(0, 10) : void 0,
      date: p.created_at ? String(p.created_at).slice(0, 10) : void 0,
      data: { survey: {}, vacaciones: {}, worksheet: {} },
      sales: [],
      activities: []
    };
    db.clients[p.id] = client;
  }
  if (!db.sales) db.sales = {};
  for (const s of rows.sales) {
    const sale = {
      saleId: s.id,
      date: s.sale_date,
      vol: num(s.vol),
      tours: intOr(s.tours, 1),
      contract: s.contract ?? void 0,
      status: s.status ?? void 0,
      processing: s.processing ?? (s.status === "no-procesable" ? "pendiente" : "procesable"),
      processDate: s.process_date ?? void 0,
      addProcessingFollowup: !!s.add_processing_followup,
      note: s.note ?? void 0,
      ts: isoToMs(s.created_at),
      prospectId: s.prospect_id ?? void 0,
      source: void 0
    };
    const client = s.prospect_id ? db.clients[s.prospect_id] : void 0;
    if (client) {
      (client.sales ||= []).push(sale);
    } else {
      db.sales[s.id] = {
        ...sale,
        clientName: s.prospect_name ?? void 0,
        orphaned: true
      };
    }
  }
  for (const a of rows.activities) {
    const activity = {
      id: a.id,
      ts: isoToMs(a.created_at),
      type: a.type,
      date: a.activity_date ?? void 0,
      title: a.title ?? void 0,
      note: a.note ?? void 0,
      source: a.source ?? void 0,
      saleId: a.sale_id ?? void 0,
      contract: a.contract ?? void 0,
      vol: a.vol != null ? num(a.vol) : void 0,
      tours: a.tours != null ? intOr(a.tours, 0) : void 0
    };
    if (a.prospect_id && db.clients[a.prospect_id]) {
      (db.clients[a.prospect_id].activities ||= []).push(activity);
    } else {
      db.userActivities.push({
        id: a.id,
        ts: activity.ts,
        type: a.type,
        date: a.activity_date ?? void 0,
        title: a.title ?? void 0,
        note: a.note ?? void 0,
        source: a.source ?? void 0
      });
    }
  }
  for (const c of rows.calendar_entries) {
    const [y, m] = c.entry_date.split("-").map(Number);
    if (!y || !m) continue;
    const key = calKey(y, m - 1);
    const day = Number(c.entry_date.slice(8, 10));
    const month = db.cal[key] ||= { days: {}, weeks: {} };
    const entry = {
      id: c.id,
      t: c.type,
      ts: isoToMs(c.created_at),
      note: c.note ?? void 0,
      vol: c.vol != null ? num(c.vol) : void 0,
      tours: c.tours != null ? intOr(c.tours, 0) : void 0,
      contract: c.contract ?? void 0,
      clientId: c.prospect_id ?? void 0,
      prospectId: c.prospect_id ?? void 0,
      clientName: c.client_name ?? void 0,
      saleId: c.sale_id ?? void 0,
      source: c.source ?? void 0,
      status: c.status ?? void 0,
      processing: c.processing ?? void 0,
      processDate: c.process_date ?? void 0,
      completed: !!c.completed,
      kind: c.kind ?? void 0
    };
    (month.days[day] ||= []).push(entry);
  }
  for (const g of rows.goals) {
    const key = calKey(g.year, g.month);
    db.goals[key] = {
      vol: num(g.vol),
      tours: intOr(g.tours, 0),
      ventas: intOr(g.ventas, 0),
      dias: intOr(g.dias, 0),
      desc: intOr(g.descansos, 0),
      updatedAt: isoToMs(g.updated_at)
    };
  }
  for (const t of rows.tool_calculations) {
    if (t.prospect_id && db.clients[t.prospect_id]) {
      (db.clients[t.prospect_id].data ||= {})[t.tool] = t.data || {};
    } else if (!t.prospect_id) {
      db.libre[t.tool] = t.data || {};
    }
  }
  return db;
}
function isEmptyDb(db) {
  return Object.keys(db.clients).length === 0 && Object.keys(db.cal).length === 0 && Object.keys(db.goals).length === 0 && Object.keys(db.libre).length === 0 && (db.userActivities?.length ?? 0) === 0;
}
export {
  dbToRows,
  isEmptyDb,
  isUuid,
  normalizeIds,
  rowsToDb
};
