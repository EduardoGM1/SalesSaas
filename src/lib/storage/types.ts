export type EntryType = "venta" | "nota" | "follow" | "descanso";

export interface CalEntry {
  id?: string;
  t: EntryType;
  ts: number;
  note?: string;
  vol?: number;
  tours?: number;
  contract?: string;
  clientId?: string;
  prospectId?: string;
  clientName?: string;
  saleId?: string;
  source?: string;
}

export interface CalMonth {
  days: Record<number, CalEntry[]>;
  weeks?: Record<string, unknown>;
}

export interface GoalMonth {
  vol?: number;
  tours?: number;
  ventas?: number;
  dias?: number;
  desc?: number;
  updatedAt?: number;
}

export interface SaleRecord {
  saleId: string;
  date: string;
  vol: number;
  tours: number;
  contract?: string;
  status?: string;
  processDate?: string;
  note?: string;
  ts: number;
  prospectId?: string;
}

export interface ClientActivity {
  id: string;
  ts: number;
  type: string;
  date?: string;
  title?: string;
  note?: string;
  source?: string;
  saleId?: string;
  contract?: string;
  vol?: number;
  tours?: number;
}

export interface ClientRecord {
  id: string;
  prospectId?: string;
  prospectCode?: string;
  name?: string;
  name1?: string;
  name2?: string;
  occupation1?: string;
  occupation2?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  contract?: string;
  status?: string;
  tourDate?: string;
  processDate?: string;
  processAmount?: number;
  note?: string;
  createdAt?: number;
  createdYmd?: string;
  date?: string;
  quickExpedient?: boolean;
  completedExpedient?: boolean;
  data?: {
    survey?: Record<string, string | number>;
    vacaciones?: Record<string, string | number>;
    worksheet?: Record<string, string | number>;
  };
  sales?: SaleRecord[];
  activities?: ClientActivity[];
}

export interface UserActivity {
  id: string;
  ts: number;
  type: string;
  date?: string;
  title?: string;
  note?: string;
  source?: string;
}

export interface AppDatabase {
  clients: Record<string, ClientRecord>;
  libre: Record<string, Record<string, string | number>>;
  cal: Record<string, CalMonth>;
  goals: Record<string, GoalMonth>;
  userActivities: UserActivity[];
}

export function emptyDatabase(): AppDatabase {
  return {
    clients: {},
    libre: {},
    cal: {},
    goals: {},
    userActivities: [],
  };
}
