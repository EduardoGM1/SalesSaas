import { create } from "zustand";
import { clientDisplayName, ensureProspectIdentity } from "@/lib/clients";
import { calKey } from "@/lib/format/dates";
import { generateActivityId, generateClientId, generateEntryId, generateProspectCode, generateSaleId } from "@/lib/ids";
import { loadDatabase, saveDatabase } from "@/lib/storage/local-storage-adapter";
import {
  AppDatabase,
  CalEntry,
  CalMonth,
  ClientActivity,
  ClientRecord,
  GoalMonth,
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
  getToolBucket: (tool: string, mode: "libre" | "client", clientId?: string | null) => Record<string, string | number>;
  saveToolBucket: (tool: string, mode: "libre" | "client", data: Record<string, string | number>, clientId?: string | null) => void;
  addClientActivity: (clientId: string, activity: Omit<ClientActivity, "id" | "ts"> & { ts?: number }) => void;
  addUserActivity: (activity: Omit<ClientActivity, "id" | "ts">) => void;
  registerClientSale: (clientId: string, sale: {
    date: string; vol: number; tours: number; contract: string;
    status: string; processDate: string; note: string;
  }) => string;
}

function cloneDb(db: AppDatabase): AppDatabase {
  return JSON.parse(JSON.stringify(db));
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
      delete db.clients[id];
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
    const saleId = generateSaleId();
    const dt = new Date(sale.date);
    const key = calKey(dt.getFullYear(), dt.getMonth());
    const day = dt.getDate();

    set((s) => {
      const db = cloneDb(s.db);
      const c = ensureProspectIdentity(db.clients[clientId]);
      if (!db.cal[key]) db.cal[key] = { days: {}, weeks: {} };
      if (!db.cal[key].days[day]) db.cal[key].days[day] = [];

      const saleNote = [clientDisplayName(c), sale.contract ? `Contrato ${sale.contract}` : "", sale.note]
        .filter(Boolean).join(" · ");

      const saleRecord = { saleId, ...sale, ts: Date.now(), prospectId: c.prospectId || clientId };
      const calEvent: CalEntry = {
        id: generateEntryId(),
        t: "venta", saleId, vol: sale.vol, tours: sale.tours, note: saleNote,
        contract: sale.contract, clientId, ts: saleRecord.ts, source: "client",
        prospectId: c.prospectId || clientId,
      };

      if (!db.cal[key].days[day].some((e) => e.saleId === saleId)) {
        db.cal[key].days[day].push(calEvent);
      }

      c.status = sale.status;
      c.contract = sale.contract || c.contract;
      c.processDate = sale.processDate || c.processDate;
      c.tourDate = c.tourDate || sale.date;
      c.sales = c.sales || [];
      if (!c.sales.some((x) => x.saleId === saleId)) c.sales.push(saleRecord);

      const noteLine = sale.note ? `Venta ${sale.date}: ${sale.note}` : "";
      if (noteLine) c.note = c.note ? `${c.note}\n${noteLine}` : noteLine;

      c.activities = c.activities || [];
      if (!c.activities.some((a) => a.saleId === saleId)) {
        c.activities.push({
          id: generateActivityId(), ts: Date.now(), type: "venta", saleId,
          date: sale.date, title: `Venta $${sale.vol}`, contract: sale.contract, vol: sale.vol, tours: sale.tours,
          note: [sale.tours ? `${sale.tours} tour(s)` : null, sale.contract ? `Contrato ${sale.contract}` : null, sale.note].filter(Boolean).join(" · "),
          source: "Registrar venta",
        });
      }

      db.clients[clientId] = c;
      saveDatabase(db);
      return { db };
    });

    return saleId;
  },
}));

export function createEmptyClient(name1: string, tourDate?: string): ClientRecord {
  const id = generateClientId();
  const ymd = tourDate || new Date().toISOString().slice(0, 10);
  return {
    id, prospectId: id, prospectCode: generateProspectCode(id),
    name: name1, name1, name2: "",
    createdAt: Date.now(), createdYmd: ymd, tourDate: ymd,
    data: { survey: {}, vacaciones: {}, worksheet: {} },
    sales: [], activities: [],
  };
}
