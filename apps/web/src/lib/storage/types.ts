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
  status?: string;
  processing?: string;
  processDate?: string;
  completed?: boolean;
  kind?: string;
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

export interface SaleSnapshot {
  prospectSummary?: {
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
    tourDate?: string;
    processDate?: string;
    note?: string;
    prospectCode?: string;
  };
  tools?: {
    survey?: Record<string, string | number>;
    vacaciones?: Record<string, string | number>;
    worksheet?: Record<string, string | number>;
  };
}

export interface SaleRecord {
  saleId: string;
  date: string;
  vol: number;
  tours: number;
  contract?: string;
  status?: string;
  processing?: string;
  processDate?: string;
  addProcessingFollowup?: boolean;
  note?: string;
  ts: number;
  prospectId?: string;
  source?: string;
  snapshot?: SaleSnapshot;
  /** Snapshot al archivar venta tras eliminar expediente */
  clientName?: string;
  prospectCode?: string;
  formerClientId?: string;
  orphaned?: boolean;
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
  tipo_tour?: string;
  tour_cuantificable?: boolean;
  createdAt?: number;
  createdYmd?: string;
  date?: string;
  quickExpedient?: boolean;
  completedExpedient?: boolean;
  hasSales?: boolean;
  lastSaleDate?: string;
  lastSaleVolume?: number;
  /** Soft delete: oculto en Clientes; ventas/tours siguen contando en stats. */
  deletedAt?: number | null;
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
  /** Ventas archivadas cuando el expediente ya no existe (clave = saleId) */
  sales?: Record<string, SaleRecord>;
  libre: Record<string, Record<string, string | number>>;
  cal: Record<string, CalMonth>;
  goals: Record<string, GoalMonth>;
  userActivities: UserActivity[];
  settings?: UserSettings;
}

export interface UserSettings {
  language?: "es" | "en";
  currency?: "USD" | "MXN" | "CAD" | "EUR";
  exchangeRate?: number;
  exchangeMode?: "manual" | "auto";
  userName?: string;
  userInitials?: string;
  worksheetConfig?: Record<string, string>;
  tourTypes?: string[];
  notifications?: {
    messages?: boolean;
    connection_requests?: boolean;
    connection_accepted?: boolean;
    shared_prospects?: boolean;
    follow_up_reminders?: boolean;
    sales_to_process?: boolean;
    scheduled_notes?: boolean;
  };
  onesignal_subscription_ids?: string[];
}

export function emptyDatabase(): AppDatabase {
  return {
    clients: {},
    sales: {},
    libre: {},
    cal: {},
    goals: {},
    userActivities: [],
    settings: {
      language: "es",
      currency: "USD",
      exchangeRate: 1,
      exchangeMode: "auto",
      userName: "Usuario",
      userInitials: "U",
    },
  };
}
