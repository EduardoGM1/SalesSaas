import { ClientRecord } from "@/lib/storage/types";

/** Mapea fila `prospects` de Supabase al shape local de expediente. */
export function prospectRowToClient(row: Record<string, unknown>): ClientRecord {
  const createdAt = row.created_at ? new Date(String(row.created_at)).getTime() : Date.now();
  const tourDate = row.tour_date ? String(row.tour_date) : undefined;
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
    createdAt,
    createdYmd: tourDate,
    quickExpedient: row.quick_expedient === true,
    completedExpedient: row.completed === true,
    data: {},
    sales: [],
    activities: [],
  };
}

export type SharePermission = "owner" | "view" | "edit" | "comment";

export function canEditShared(perm: SharePermission) {
  return perm === "owner" || perm === "edit";
}

export function canCommentShared(perm: SharePermission) {
  return perm === "owner" || perm === "edit" || perm === "comment";
}
