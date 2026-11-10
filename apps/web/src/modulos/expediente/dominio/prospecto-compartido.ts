import { ClientRecord, ClientActivity, SaleRecord } from "@/lib/storage/types";

function isoToMs(iso: unknown): number {
  if (!iso) return Date.now();
  const ms = new Date(String(iso)).getTime();
  return Number.isFinite(ms) ? ms : Date.now();
}

function mapSaleRow(s: Record<string, unknown>): SaleRecord {
  return {
    saleId: String(s.id),
    date: String(s.sale_date || ""),
    vol: Number(s.vol || 0),
    tours: Number(s.tours || 1),
    contract: s.contract ? String(s.contract) : undefined,
    status: s.status ? String(s.status) : undefined,
    processing: s.processing
      ? String(s.processing)
      : (s.status === "pendiente" ? "pendiente" : "venta"),
    processDate: s.process_date ? String(s.process_date) : undefined,
    addProcessingFollowup: !!s.add_processing_followup,
    note: s.note ? String(s.note) : undefined,
    ts: isoToMs(s.created_at),
    prospectId: s.prospect_id ? String(s.prospect_id) : undefined,
  };
}

function mapActivityRow(a: Record<string, unknown>): ClientActivity {
  return {
    id: String(a.id),
    ts: isoToMs(a.created_at),
    type: String(a.type || "nota"),
    date: a.activity_date ? String(a.activity_date) : undefined,
    title: a.title ? String(a.title) : undefined,
    note: a.note ? String(a.note) : undefined,
    source: a.source ? String(a.source) : undefined,
    saleId: a.sale_id ? String(a.sale_id) : undefined,
    contract: a.contract ? String(a.contract) : undefined,
    vol: a.vol != null ? Number(a.vol) : undefined,
    tours: a.tours != null ? Number(a.tours) : undefined,
  };
}

/** Mapea fila `prospects` (+ ventas/actividades opcionales) al shape local. */
export function prospectRowToClient(
  row: Record<string, unknown>,
  extras: {
    sales?: Record<string, unknown>[];
    activities?: Record<string, unknown>[];
    tools?: Record<string, Record<string, unknown>>;
  } = {},
): ClientRecord {
  const createdAt = row.created_at ? new Date(String(row.created_at)).getTime() : Date.now();
  const tourDate = row.tour_date ? String(row.tour_date) : undefined;
  const sales = (extras.sales || []).map(mapSaleRow);
  const activities = (extras.activities || []).map(mapActivityRow);
  return {
    id: String(row.id),
    prospectId: String(row.id),
    prospectCode: row.prospect_code ? String(row.prospect_code) : undefined,
    name: row.name ? String(row.name) : undefined,
    name1: row.name1 ? String(row.name1) : undefined,
    name2: row.name2 ? String(row.name2) : undefined,
    occupation1: row.occupation1 ? String(row.occupation1) : undefined,
    occupation2: row.occupation2 ? String(row.occupation2) : undefined,
    city: row.city ? String(row.city) : undefined,
    country: row.country ? String(row.country) : undefined,
    phone: row.phone ? String(row.phone) : undefined,
    email: row.email ? String(row.email) : undefined,
    contract: row.contract ? String(row.contract) : undefined,
    status: row.status ? String(row.status) : undefined,
    tourDate,
    processDate: row.process_date ? String(row.process_date) : undefined,
    processAmount: row.process_amount != null ? Number(row.process_amount) : undefined,
    note: row.note ? String(row.note) : undefined,
    tipo_tour: row.tipo_tour ? String(row.tipo_tour) : undefined,
    tour_cuantificable: row.tour_cuantificable != null ? !!row.tour_cuantificable : undefined,
    createdAt,
    createdYmd: tourDate,
    quickExpedient: row.quick_expedient === true,
    completedExpedient: row.completed === true,
    deletedAt: row.deleted_at ? new Date(String(row.deleted_at)).getTime() : null,
    data: extras.tools ? { ...extras.tools } : {},
    sales,
    activities,
  };
}

export type SharePermission = "owner" | "view" | "edit" | "comment" | "workspace";

export function canEditShared(perm: SharePermission) {
  return perm === "owner" || perm === "edit" || perm === "workspace";
}

export function canCommentShared(perm: SharePermission) {
  return perm === "owner" || perm === "edit" || perm === "comment" || perm === "workspace";
}

export function canAddToWorkspace(perm: SharePermission | string | undefined | null) {
  return perm === "edit" || perm === "workspace";
}
