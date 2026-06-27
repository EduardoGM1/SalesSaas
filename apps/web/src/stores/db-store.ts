import { create } from "zustand";
import { clientDisplayName, ensureProspectIdentity } from "@/lib/clients";
import { calKey } from "@/lib/format/dates";
import { generateActivityId, generateClientId, generateEntryId, generateProspectCode, generateSaleId } from "@/lib/ids";
import { withSaleSnapshot } from "@/lib/sales/snapshot";
import { loadDatabase, saveDatabase } from "@/lib/storage/local-storage-adapter";
import {
  AppDatabase,
  CalEntry,
  CalMonth,
  ClientActivity,
  ClientRecord,
  GoalMonth,
  SaleRecord,
  emptyDatabase,
} from "@/lib/storage/types";

interface DbState {
  db: AppDatabase;
  hydrate: () => void;
  persist: () => void;
  replaceDb: (db: AppDatabase) => void;
  getCalMonth: (year: number, month: number) => CalMonth;
  getGoalMonth: (year: number, month: number) => GoalMonth;
  saveGoalMonth: (year: number, month: number, goal: Partial<GoalMonth>) => void;
  addCalEntry: (year: number, month: number, day: number, entry: CalEntry) => void;
  deleteCalEntry: (year: number, month: number, day: number, index: number) => void;
  addCalEntryByDate: (dateStr: string, entry: CalEntry) => void;
  getClient: (id: string) => ClientRecord | undefined;
  saveClient: (client: ClientRecord) => void;
  deleteClient: (id: string) => void;
  deleteClientSale: (clientId: string, saleId: string) => void;
  getToolBucket: (tool: string, mode: "libre" | "client", clientId?: string | null) => Record<string, string | number>;
  saveToolBucket: (tool: string, mode: "libre" | "client", data: Record<string, string | number>, clientId?: string | null) => void;
  addClientActivity: (clientId: string, activity: Omit<ClientActivity, "id" | "ts"> & { ts?: number }) => void;
  addUserActivity: (activity: Omit<ClientActivity, "id" | "ts">) => void;
  registerClientSale: (clientId: string, sale: {
    saleId?: string;
    date: string; vol: number; tours: number; contract: string;
    status: string; processDate: string; note: string; addProcessingFollowup?: boolean; source?: string;
  }) => string;
  updateClientSale: (clientId: string, saleId: string, sale: {
    date: string; vol: number; tours: number; contract: string;
    status: string; processDate: string; note: string; addProcessingFollowup?: boolean; source?: string;
  }) => void;
  completeClientExpedient: (clientId: string) => void;
}

function cloneDb(db: AppDatabase): AppDatabase {
  return JSON.parse(JSON.stringify(db));
}

function isProcessableSale(sale: Pick<SaleRecord, "status" | "processing">): boolean {
  return String(sale.status || "venta") !== "pendiente" && String(sale.processing || "venta") !== "pendiente";
}

function addCalendarEventByDateToDb(db: AppDatabase, dateStr: string, entry: CalEntry): void {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return;
  const key = calKey(y, m - 1);
  if (!db.cal[key]) db.cal[key] = { days: {}, weeks: {} };
  if (!db.cal[key].days[d]) db.cal[key].days[d] = [];
  if (!entry.id) entry.id = generateEntryId();
  db.cal[key].days[d].push(entry);
}

function removeCalendarEntriesForSale(db: AppDatabase, saleId: string): void {
  if (!saleId) return;
  Object.values(db.cal).forEach((month) => {
    Object.keys(month.days || {}).forEach((day) => {
      month.days[Number(day)] = (month.days[Number(day)] || []).filter((entry) => entry.saleId !== saleId);
      if (!month.days[Number(day)]?.length) delete month.days[Number(day)];
    });
  });
}

function removeCalendarEntriesForClient(db: AppDatabase, clientId: string): void {
  if (!clientId) return;
  Object.values(db.cal).forEach((month) => {
    Object.keys(month.days || {}).forEach((day) => {
      month.days[Number(day)] = (month.days[Number(day)] || []).filter((entry) => {
        if (entry.clientId === clientId || entry.prospectId === clientId) return false;
        return true;
      });
      if (!month.days[Number(day)]?.length) delete month.days[Number(day)];
    });
  });
}

function removeArchivedSales(db: AppDatabase, saleIds: string[]): void {
  if (!db.sales || !saleIds.length) return;
  for (const saleId of saleIds) {
    if (saleId) delete db.sales[saleId];
  }
}

function recalcClientSaleMeta(client: ClientRecord): void {
  client.hasSales = (client.sales ?? []).some(isProcessableSale);
  const lastProcessable = (client.sales ?? []).filter(isProcessableSale).sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
  client.lastSaleDate = lastProcessable?.date || "";
  client.lastSaleVolume = lastProcessable?.vol || 0;
}

function upsertSaleActivity(client: ClientRecord, sale: SaleRecord): void {
  client.activities = client.activities || [];
  const title = isProcessableSale(sale) ? `Venta $${sale.vol}` : `Venta pendiente $${sale.vol}`;
  const payload: Omit<ClientActivity, "id" | "ts"> & { ts: number } = {
    type: "venta",
    saleId: sale.saleId,
    date: sale.date,
    title,
    contract: sale.contract,
    vol: sale.vol,
    tours: sale.tours,
    ts: sale.ts || Date.now(),
    note: [
      isProcessableSale(sale) ? "Venta" : "Pendiente",
      sale.tours ? `${sale.tours} tour(s)` : null,
      sale.contract ? `Folio ${sale.contract}` : null,
      sale.note,
    ].filter(Boolean).join(" · "),
    source: sale.source || "Venta del expediente",
  };
  const idx = client.activities.findIndex((activity) => activity.saleId === sale.saleId);
  if (idx >= 0) client.activities[idx] = { ...client.activities[idx], ...payload };
  else client.activities.push({ id: generateActivityId(), ...payload });
}

function ensureSaleInClientAndAgenda(db: AppDatabase, clientId: string, sale: SaleRecord): void {
  const client = ensureProspectIdentity(db.clients[clientId]);
  client.sales = client.sales || [];
  const idx = client.sales.findIndex((existing) => existing.saleId === sale.saleId);
  if (idx >= 0) client.sales[idx] = { ...client.sales[idx], ...sale };
  else client.sales.push(sale);

  removeCalendarEntriesForSale(db, sale.saleId);

  if (isProcessableSale(sale)) {
    addCalendarEventByDateToDb(db, sale.date, {
      id: generateEntryId(),
      t: "venta",
      saleId: sale.saleId,
      vol: sale.vol,
      tours: sale.tours,
      note: [clientDisplayName(client), sale.contract ? `Folio ${sale.contract}` : "", sale.note].filter(Boolean).join(" · "),
      contract: sale.contract,
      status: sale.status,
      processing: sale.processing,
      processDate: sale.processDate,
      clientId,
      prospectId: client.prospectId || clientId,
      clientName: clientDisplayName(client),
      ts: sale.ts,
      source: "client",
    });
  } else if (sale.addProcessingFollowup && sale.processDate) {
    const note = `Procesar venta pendiente - Cliente ${clientDisplayName(client)}${sale.contract ? ` - Folio ${sale.contract}` : ""}`;
    addCalendarEventByDateToDb(db, sale.processDate, {
      id: generateEntryId(),
      t: "follow",
      saleId: sale.saleId,
      note,
      status: sale.status,
      processing: "pendiente",
      processDate: sale.processDate,
      clientId,
      prospectId: client.prospectId || clientId,
      clientName: clientDisplayName(client),
      ts: Date.now(),
      source: "client-sale-processing",
      kind: "procesamiento-venta",
      completed: false,
    });
  }

  upsertSaleActivity(client, sale);
  client.hasSales = client.sales.some(isProcessableSale);
  const lastProcessable = client.sales.filter(isProcessableSale).sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
  client.lastSaleDate = lastProcessable?.date || "";
  client.lastSaleVolume = lastProcessable?.vol || 0;
  db.clients[clientId] = client;
}

export const useDbStore = create<DbState>((set, get) => ({
  db: emptyDatabase(),

  hydrate: () => set({ db: loadDatabase() }),

  persist: () => saveDatabase(get().db),

  replaceDb: (db) => {
    set({ db });
    saveDatabase(db);
  },

  getCalMonth: (year, month) => {
    const k = calKey(year, month);
    const db = get().db;
    if (!db.cal[k]) db.cal[k] = { days: {}, weeks: {} };
    return db.cal[k];
  },

  getGoalMonth: (year, month) => {
    const k = calKey(year, month);
    const db = get().db;
    if (!db.goals[k]) db.goals[k] = {};
    return db.goals[k];
  },

  saveGoalMonth: (year, month, goal) => {
    const k = calKey(year, month);
    set((s) => {
      const db = cloneDb(s.db);
      db.goals[k] = { ...db.goals[k], ...goal, updatedAt: Date.now() };
      saveDatabase(db);
      return { db };
    });
  },

  addCalEntry: (year, month, day, entry) => {
    const k = calKey(year, month);
    set((s) => {
      const db = cloneDb(s.db);
      if (!db.cal[k]) db.cal[k] = { days: {}, weeks: {} };
      if (!db.cal[k].days[day]) db.cal[k].days[day] = [];
      if (!entry.id) entry.id = generateEntryId();
      db.cal[k].days[day].push(entry);
      saveDatabase(db);
      return { db };
    });
  },

  deleteCalEntry: (year, month, day, index) => {
    const k = calKey(year, month);
    set((s) => {
      const db = cloneDb(s.db);
      db.cal[k]?.days[day]?.splice(index, 1);
      saveDatabase(db);
      return { db };
    });
  },

  addCalEntryByDate: (dateStr, entry) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    if (!y || !m || !d) return;
    get().addCalEntry(y, m - 1, d, entry);
  },

  getClient: (id) => {
    const c = get().db.clients[id];
    return c ? ensureProspectIdentity({ ...c }) : undefined;
  },

  saveClient: (client) => {
    set((s) => {
      const db = cloneDb(s.db);
      db.clients[client.id] = ensureProspectIdentity(client);
      saveDatabase(db);
      return { db };
    });
  },

  deleteClient: (id) => {
    set((s) => {
      const db = cloneDb(s.db);
      const client = db.clients[id];
      if (client) {
        const saleIds = (client.sales ?? []).map((sale) => sale.saleId).filter(Boolean);
        for (const saleId of saleIds) removeCalendarEntriesForSale(db, saleId);
        removeCalendarEntriesForClient(db, id);
        removeArchivedSales(db, saleIds);
      }
      delete db.clients[id];
      saveDatabase(db);
      return { db };
    });
  },

  deleteClientSale: (clientId, saleId) => {
    set((s) => {
      const db = cloneDb(s.db);
      const client = db.clients[clientId];
      if (!client || !saleId) return s;
      client.sales = (client.sales ?? []).filter((sale) => sale.saleId !== saleId);
      client.activities = (client.activities ?? []).filter((activity) => activity.saleId !== saleId);
      recalcClientSaleMeta(client);
      removeCalendarEntriesForSale(db, saleId);
      removeArchivedSales(db, [saleId]);
      db.clients[clientId] = client;
      saveDatabase(db);
      return { db };
    });
  },

  getToolBucket: (tool, mode, clientId) => {
    const db = get().db;
    if (mode === "client" && clientId) {
      const c = db.clients[clientId];
      if (!c) return {};
      if (!c.data) c.data = {};
      if (!c.data[tool as keyof typeof c.data]) c.data[tool as keyof typeof c.data] = {};
      return (c.data[tool as keyof typeof c.data] as Record<string, string | number>) || {};
    }
    if (!db.libre[tool]) db.libre[tool] = {};
    return db.libre[tool];
  },

  saveToolBucket: (tool, mode, data, clientId) => {
    set((s) => {
      const db = cloneDb(s.db);
      if (mode === "client" && clientId && db.clients[clientId]) {
        if (!db.clients[clientId].data) db.clients[clientId].data = {};
        db.clients[clientId].data![tool as keyof NonNullable<ClientRecord["data"]>] = { ...data };
      } else {
        db.libre[tool] = { ...data };
      }
      saveDatabase(db);
      return { db };
    });
  },

  addClientActivity: (clientId, activity) => {
    set((s) => {
      const db = cloneDb(s.db);
      const c = db.clients[clientId];
      if (!c) return s;
      ensureProspectIdentity(c);
      c.activities = c.activities || [];
      if (activity.saleId && c.activities.some((a) => a.saleId === activity.saleId)) return s;
      c.activities.push({ id: generateActivityId(), ts: activity.ts ?? Date.now(), ...activity });
      saveDatabase(db);
      return { db };
    });
  },

  addUserActivity: (activity) => {
    set((s) => {
      const db = cloneDb(s.db);
      db.userActivities.push({ id: generateActivityId("u"), ts: Date.now(), ...activity });
      saveDatabase(db);
      return { db };
    });
  },

  registerClientSale: (clientId, sale) => {
    const saleId = sale.saleId || generateSaleId();
    set((s) => {
      const db = cloneDb(s.db);
      const c = ensureProspectIdentity(db.clients[clientId]);
      const status = sale.status || "venta";
      const saleRecord: SaleRecord = {
        saleId,
        date: sale.date,
        vol: sale.vol,
        tours: sale.tours || 1,
        contract: sale.contract,
        status,
        processing: status === "pendiente" ? "pendiente" : "venta",
        processDate: status === "pendiente" ? sale.processDate : "",
        addProcessingFollowup: status === "pendiente" && !!sale.addProcessingFollowup,
        note: sale.note,
        ts: Date.now(),
        prospectId: c.prospectId || clientId,
        source: sale.source || "Venta del expediente",
      };
      c.status = sale.status;
      c.contract = sale.contract || c.contract;
      c.processDate = saleRecord.processDate || "";
      c.tourDate = c.tourDate || sale.date;

      const noteLine = sale.note ? `Venta ${sale.date}: ${sale.note}` : "";
      if (noteLine) c.note = c.note ? `${c.note}\n${noteLine}` : noteLine;

      db.clients[clientId] = c;
      ensureSaleInClientAndAgenda(db, clientId, withSaleSnapshot(c, saleRecord));
      saveDatabase(db);
      return { db };
    });

    return saleId;
  },

  updateClientSale: (clientId, saleId, sale) => {
    set((s) => {
      const db = cloneDb(s.db);
      const c = ensureProspectIdentity(db.clients[clientId]);
      const existing = (c.sales || []).find((item) => item.saleId === saleId);
      const status = sale.status || existing?.status || "venta";
      const saleRecord: SaleRecord = {
        ...existing,
        saleId,
        date: sale.date,
        vol: sale.vol,
        tours: sale.tours || 1,
        contract: sale.contract,
        status,
        processing: status === "pendiente" ? "pendiente" : "venta",
        processDate: status === "pendiente" ? sale.processDate : "",
        addProcessingFollowup: status === "pendiente" && !!sale.addProcessingFollowup,
        note: sale.note,
        ts: Date.now(),
        prospectId: c.prospectId || clientId,
        source: sale.source || existing?.source || "Venta del expediente",
      };
      c.status = saleRecord.status;
      c.contract = saleRecord.contract || c.contract;
      c.processDate = saleRecord.processDate || "";
      c.tourDate = c.tourDate || saleRecord.date;
      db.clients[clientId] = c;
      ensureSaleInClientAndAgenda(db, clientId, withSaleSnapshot(c, saleRecord));
      saveDatabase(db);
      return { db };
    });
  },

  completeClientExpedient: (clientId) => {
    set((s) => {
      const db = cloneDb(s.db);
      const c = db.clients[clientId];
      if (!c) return s;
      c.quickExpedient = false;
      c.completedExpedient = true;
      c.data = c.data || {};
      c.data.survey = c.data.survey || {};
      c.data.vacaciones = c.data.vacaciones || {};
      c.data.worksheet = c.data.worksheet || {};
      saveDatabase(db);
      return { db };
    });
  },
}));

export function createEmptyClient(name1: string, tourDate?: string): ClientRecord {
  const id = generateClientId();
  const ymd = tourDate || new Date().toISOString().slice(0, 10);
  return {
    id, prospectId: id, prospectCode: generateProspectCode(id),
    name: name1, name1, name2: "",
    createdAt: Date.now(), createdYmd: ymd, tourDate: ymd,
    quickExpedient: false,
    completedExpedient: true,
    data: { survey: {}, vacaciones: {}, worksheet: {} },
    sales: [], activities: [],
  };
}
