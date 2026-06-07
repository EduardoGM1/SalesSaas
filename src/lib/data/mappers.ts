import { calKey } from "@/lib/format/dates";
import { generateActivityId, generateEntryId, generateProspectCode, generateSaleId } from "@/lib/ids";
import {
  AppDatabase,
  CalEntry,
  ClientActivity,
  ClientRecord,
  emptyDatabase,
  SaleRecord,
} from "@/lib/storage/types";

// ---------- Tipos de fila (snake_case = columnas de Supabase) ----------
export interface ProspectRow {
  id: string;
  user_id: string;
  prospect_code: string;
  name: string | null;
  name1: string | null;
  name2: string | null;
  occupation1: string | null;
  occupation2: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  contract: string | null;
  status: string | null;
  tour_date: string | null;
  process_date: string | null;
  process_amount: number;
  note: string | null;
  completed: boolean;
  quick_expedient: boolean;
  created_at?: string;
}

export interface SaleRow {
  id: string;
  user_id: string;
  prospect_id: string;
  sale_date: string;
  vol: number;
  tours: number;
  contract: string | null;
  status: string | null;
  process_date: string | null;
  note: string | null;
  created_at?: string;
}

export interface CalRow {
  id: string;
  user_id: string;
  prospect_id: string | null;
  sale_id: string | null;
  type: string;
  entry_date: string;
  note: string | null;
  vol: number | null;
  tours: number | null;
  contract: string | null;
  source: string | null;
  created_at?: string;
}

export interface GoalRow {
  user_id: string;
  year: number;
  month: number;
  vol: number;
  tours: number;
  ventas: number;
  dias: number;
  descansos: number;
  updated_at?: string;
}

export interface ActivityRow {
  id: string;
  user_id: string;
  prospect_id: string | null;
  sale_id: string | null;
  type: string;
  title: string | null;
  note: string | null;
  activity_date: string | null;
  source: string | null;
  vol: number | null;
  tours: number | null;
  contract: string | null;
  created_at?: string;
}

export interface ToolRow {
  user_id: string;
  prospect_id: string | null;
  tool: string;
  data: Record<string, string | number>;
}

export interface SupabaseRows {
  prospects: ProspectRow[];
  sales: SaleRow[];
  calendar_entries: CalRow[];
  goals: GoalRow[];
  activities: ActivityRow[];
  tool_calculations: ToolRow[];
}

// ---------- Helpers ----------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set([
  "venta", "bback", "procesable", "no-procesable", "perdido", "cerrado", "procesado",
]);
const TOOLS = ["survey", "vacaciones", "worksheet"] as const;

export function isUuid(v: unknown): boolean {
  return typeof v === "string" && UUID_RE.test(v);
}

function sanitizeStatus(s: unknown): string | null {
  return typeof s === "string" && STATUSES.has(s) ? s : null;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function intOr(v: unknown, fallback: number): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : fallback;
}

function toDateOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function tsToISO(ms: unknown): string | undefined {
  const n = Number(ms);
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : undefined;
}

function isoToMs(s: unknown): number {
  const t = Date.parse(String(s ?? ""));
  return Number.isFinite(t) ? t : Date.now();
}

function nonEmptyData(d: unknown): Record<string, string | number> | null {
  if (!d || typeof d !== "object") return null;
  const obj = d as Record<string, string | number>;
  return Object.keys(obj).length > 0 ? obj : null;
}

function parseGoalKey(key: string): { year: number; month: number } | null {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  return { year: y, month: m - 1 }; // month 0-based en BD
}

// ============================================================
// Normalización de IDs heredados (no-UUID) a UUID, con remapeo
// de todas las referencias. Devuelve una copia normalizada.
// ============================================================
export function normalizeIds(db: AppDatabase): { db: AppDatabase; changed: boolean } {
  const next: AppDatabase = JSON.parse(JSON.stringify(db));
  let changed = false;

  const clientIdMap = new Map<string, string>();
  const saleIdMap = new Map<string, string>();

  // 1) Clientes
  const newClients: Record<string, ClientRecord> = {};
  for (const [oldId, client] of Object.entries(next.clients)) {
    const newId = isUuid(oldId) ? oldId : generateProspectId();
    if (newId !== oldId) changed = true;
    clientIdMap.set(oldId, newId);
    client.id = newId;
    if (!client.prospectId || client.prospectId === oldId || !isUuid(client.prospectId)) {
      client.prospectId = newId;
    }
    if (!client.prospectCode) client.prospectCode = generateProspectCode(newId);
    // ventas
    for (const sale of client.sales ?? []) {
      const oldSale = sale.saleId;
      const newSale = isUuid(oldSale) ? oldSale : generateSaleId();
      if (newSale !== oldSale) changed = true;
      if (oldSale) saleIdMap.set(oldSale, newSale);
      sale.saleId = newSale;
      sale.prospectId = newId;
    }
    // actividades
    for (const act of client.activities ?? []) {
      if (!isUuid(act.id)) {
        act.id = generateActivityId();
        changed = true;
      }
    }
    newClients[newId] = client;
  }
  next.clients = newClients;

  // 2) Remapear saleId en actividades (después de construir el mapa completo)
  for (const client of Object.values(next.clients)) {
    for (const act of client.activities ?? []) {
      if (act.saleId && saleIdMap.has(act.saleId)) act.saleId = saleIdMap.get(act.saleId)!;
    }
  }

  // 3) Entradas de calendario
  for (const month of Object.values(next.cal)) {
    for (const entries of Object.values(month.days)) {
      for (const e of entries) {
        if (!isUuid(e.id)) {
          e.id = generateEntryId();
          changed = true;
        }
        if (e.clientId && clientIdMap.has(e.clientId)) e.clientId = clientIdMap.get(e.clientId)!;
        if (e.prospectId && clientIdMap.has(e.prospectId)) e.prospectId = clientIdMap.get(e.prospectId)!;
        if (e.saleId && saleIdMap.has(e.saleId)) e.saleId = saleIdMap.get(e.saleId)!;
      }
    }
  }

  // 4) Actividades de usuario
  for (const ua of next.userActivities ?? []) {
    if (!isUuid(ua.id)) {
      ua.id = generateActivityId();
      changed = true;
    }
  }

  return { db: next, changed };
}

function generateProspectId(): string {
  return generateSaleId(); // ambos producen UUID v4
}

// ============================================================
// AppDatabase -> filas de Supabase
// ============================================================
export function dbToRows(db: AppDatabase, userId: string): SupabaseRows {
  const prospects: ProspectRow[] = [];
  const sales: SaleRow[] = [];
  const calendar_entries: CalRow[] = [];
  const goals: GoalRow[] = [];
  const activities: ActivityRow[] = [];
  const tool_calculations: ToolRow[] = [];

  const validProspectIds = new Set<string>();
  const validSaleIds = new Set<string>();
  for (const client of Object.values(db.clients)) {
    if (isUuid(client.id)) validProspectIds.add(client.id);
    for (const sale of client.sales ?? []) {
      if (isUuid(sale.saleId)) validSaleIds.add(sale.saleId);
    }
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
      created_at: tsToISO(client.createdAt),
    });

    for (const sale of client.sales ?? []) {
      if (!isUuid(sale.saleId)) continue;
      sales.push({
        id: sale.saleId,
        user_id: userId,
        prospect_id: client.id,
        sale_date: toDateOrNull(sale.date) ?? new Date().toISOString().slice(0, 10),
        vol: num(sale.vol),
        tours: intOr(sale.tours, 1),
        contract: sale.contract ?? null,
        status: sanitizeStatus(sale.status),
        process_date: toDateOrNull(sale.processDate),
        note: sale.note ?? null,
        created_at: tsToISO(sale.ts),
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
        created_at: tsToISO(act.ts),
      });
    }

    // tool data por cliente
    for (const tool of TOOLS) {
      const data = nonEmptyData(client.data?.[tool]);
      if (data) tool_calculations.push({ user_id: userId, prospect_id: client.id, tool, data });
    }
  }

  // Entradas de calendario
  for (const [key, month] of Object.entries(db.cal)) {
    for (const [dayStr, entries] of Object.entries(month.days)) {
      const day = Number(dayStr);
      const entry_date = `${key}-${String(day).padStart(2, "0")}`;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry_date)) continue;
      for (const e of entries) {
        if (!isUuid(e.id)) continue;
        const pid = e.clientId && validProspectIds.has(e.clientId)
          ? e.clientId
          : e.prospectId && validProspectIds.has(e.prospectId)
            ? e.prospectId
            : null;
        calendar_entries.push({
          id: e.id!,
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
          created_at: tsToISO(e.ts),
        });
      }
    }
  }

  // Metas
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
      updated_at: tsToISO(goal.updatedAt),
    });
  }

  // Calculadoras libres
  for (const tool of TOOLS) {
    const data = nonEmptyData(db.libre[tool]);
    if (data) tool_calculations.push({ user_id: userId, prospect_id: null, tool, data });
  }

  return { prospects, sales, calendar_entries, goals, activities, tool_calculations };
}

// ============================================================
// Filas de Supabase -> AppDatabase
// ============================================================
export function rowsToDb(rows: SupabaseRows): AppDatabase {
  const db = emptyDatabase();

  for (const p of rows.prospects) {
    const client: ClientRecord = {
      id: p.id,
      prospectId: p.id,
      prospectCode: p.prospect_code,
      name: p.name ?? undefined,
      name1: p.name1 ?? undefined,
      name2: p.name2 ?? undefined,
      occupation1: p.occupation1 ?? undefined,
      occupation2: p.occupation2 ?? undefined,
      city: p.city ?? undefined,
      country: p.country ?? undefined,
      phone: p.phone ?? undefined,
      email: p.email ?? undefined,
      contract: p.contract ?? undefined,
      status: p.status ?? undefined,
      tourDate: p.tour_date ?? undefined,
      processDate: p.process_date ?? undefined,
      processAmount: p.process_amount != null ? num(p.process_amount) : undefined,
      note: p.note ?? undefined,
      completedExpedient: !!p.completed,
      quickExpedient: !!p.quick_expedient,
      createdAt: isoToMs(p.created_at),
      createdYmd: p.created_at ? String(p.created_at).slice(0, 10) : undefined,
      date: p.created_at ? String(p.created_at).slice(0, 10) : undefined,
      data: { survey: {}, vacaciones: {}, worksheet: {} },
      sales: [],
      activities: [],
    };
    db.clients[p.id] = client;
  }

  for (const s of rows.sales) {
    const client = db.clients[s.prospect_id];
    if (!client) continue;
    const sale: SaleRecord = {
      saleId: s.id,
      date: s.sale_date,
      vol: num(s.vol),
      tours: intOr(s.tours, 1),
      contract: s.contract ?? undefined,
      status: s.status ?? undefined,
      processDate: s.process_date ?? undefined,
      note: s.note ?? undefined,
      ts: isoToMs(s.created_at),
      prospectId: s.prospect_id,
    };
    (client.sales ||= []).push(sale);
  }

  for (const a of rows.activities) {
    const activity: ClientActivity = {
      id: a.id,
      ts: isoToMs(a.created_at),
      type: a.type,
      date: a.activity_date ?? undefined,
      title: a.title ?? undefined,
      note: a.note ?? undefined,
      source: a.source ?? undefined,
      saleId: a.sale_id ?? undefined,
      contract: a.contract ?? undefined,
      vol: a.vol != null ? num(a.vol) : undefined,
      tours: a.tours != null ? intOr(a.tours, 0) : undefined,
    };
    if (a.prospect_id && db.clients[a.prospect_id]) {
      (db.clients[a.prospect_id].activities ||= []).push(activity);
    } else {
      db.userActivities.push({
        id: a.id,
        ts: activity.ts,
        type: a.type,
        date: a.activity_date ?? undefined,
        title: a.title ?? undefined,
        note: a.note ?? undefined,
        source: a.source ?? undefined,
      });
    }
  }

  for (const c of rows.calendar_entries) {
    const [y, m] = c.entry_date.split("-").map(Number);
    if (!y || !m) continue;
    const key = calKey(y, m - 1);
    const day = Number(c.entry_date.slice(8, 10));
    const month = (db.cal[key] ||= { days: {}, weeks: {} });
    const entry: CalEntry = {
      id: c.id,
      t: c.type as CalEntry["t"],
      ts: isoToMs(c.created_at),
      note: c.note ?? undefined,
      vol: c.vol != null ? num(c.vol) : undefined,
      tours: c.tours != null ? intOr(c.tours, 0) : undefined,
      contract: c.contract ?? undefined,
      clientId: c.prospect_id ?? undefined,
      prospectId: c.prospect_id ?? undefined,
      saleId: c.sale_id ?? undefined,
      source: c.source ?? undefined,
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
      updatedAt: isoToMs(g.updated_at),
    };
  }

  for (const t of rows.tool_calculations) {
    if (t.prospect_id && db.clients[t.prospect_id]) {
      (db.clients[t.prospect_id].data ||= {})[t.tool as "survey" | "vacaciones" | "worksheet"] = t.data || {};
    } else if (!t.prospect_id) {
      db.libre[t.tool] = t.data || {};
    }
  }

  return db;
}

export function isEmptyDb(db: AppDatabase): boolean {
  return (
    Object.keys(db.clients).length === 0 &&
    Object.keys(db.cal).length === 0 &&
    Object.keys(db.goals).length === 0 &&
    Object.keys(db.libre).length === 0 &&
    (db.userActivities?.length ?? 0) === 0
  );
}
