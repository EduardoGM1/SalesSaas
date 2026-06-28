import { isUuid } from "@/lib/data/mappers";
import { generateClientId, generateEntryId, generateProspectCode, generateSaleId, generateActivityId } from "@/lib/ids";

const STATUSES = new Set([
  "venta", "bback", "pendiente", "perdido", "cerrado",
]);
const ENTRY_TYPES = new Set(["venta", "nota", "follow", "descanso"]);
const TOOLS = new Set(["survey", "vacaciones", "worksheet"]);

export function sanitizeStatus(v: unknown): string | null {
  return typeof v === "string" && STATUSES.has(v) ? v : null;
}

export function sanitizeEntryType(v: unknown): string | null {
  return typeof v === "string" && ENTRY_TYPES.has(v) ? v : null;
}

export function sanitizeTool(v: unknown): string | null {
  return typeof v === "string" && TOOLS.has(v) ? v : null;
}

export function toDateOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export function bodyToProspectInsert(
  body: Record<string, unknown>,
  userId: string
): Record<string, unknown> {
  const id: string = isUuid(body.id) ? String(body.id) : generateClientId();
  return {
    id,
    user_id: userId,
    prospect_code: (typeof body.prospect_code === "string" && body.prospect_code) ||
      (typeof body.prospectCode === "string" && body.prospectCode) ||
      generateProspectCode(id),
    name: body.name ?? body.name1 ?? null,
    name1: body.name1 ?? body.name ?? null,
    name2: body.name2 ?? null,
    occupation1: body.occupation1 ?? null,
    occupation2: body.occupation2 ?? null,
    city: body.city ?? null,
    country: body.country ?? null,
    phone: body.phone ?? null,
    email: body.email ?? null,
    contract: body.contract ?? null,
    status: sanitizeStatus(body.status),
    tour_date: toDateOrNull(body.tour_date ?? body.tourDate),
    process_date: toDateOrNull(body.process_date ?? body.processDate),
    process_amount: Number(body.process_amount ?? body.processAmount ?? 0) || 0,
    note: body.note ?? null,
    tipo_tour: body.tipo_tour ?? body.tipoTour ?? null,
    tour_cuantificable: body.tour_cuantificable != null ? Boolean(body.tour_cuantificable) : body.tourCuantificable != null ? Boolean(body.tourCuantificable) : null,
    completed: Boolean(body.completed ?? body.completedExpedient ?? false),
    quick_expedient: Boolean(body.quick_expedient ?? body.quickExpedient ?? false),
  };
}

export function bodyToProspectPatch(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const map: [string, string[]][] = [
    ["name", ["name", "name1"]],
    ["name1", ["name1", "name"]],
    ["name2", ["name2"]],
    ["occupation1", ["occupation1"]],
    ["occupation2", ["occupation2"]],
    ["city", ["city"]],
    ["country", ["country"]],
    ["phone", ["phone"]],
    ["email", ["email"]],
    ["contract", ["contract"]],
    ["note", ["note"]],
    ["tipo_tour", ["tipo_tour", "tipoTour"]],
    ["tour_cuantificable", ["tour_cuantificable", "tourCuantificable"]],
  ];
  for (const [col, keys] of map) {
    for (const k of keys) {
      if (body[k] !== undefined) {
        patch[col] = body[k];
        break;
      }
    }
  }
  if (body.status !== undefined) patch.status = sanitizeStatus(body.status);
  if (body.tour_date !== undefined || body.tourDate !== undefined) {
    patch.tour_date = toDateOrNull(body.tour_date ?? body.tourDate);
  }
  if (body.process_date !== undefined || body.processDate !== undefined) {
    patch.process_date = toDateOrNull(body.process_date ?? body.processDate);
  }
  if (body.process_amount !== undefined || body.processAmount !== undefined) {
    patch.process_amount = Number(body.process_amount ?? body.processAmount ?? 0) || 0;
  }
  if (body.completed !== undefined || body.completedExpedient !== undefined) {
    patch.completed = Boolean(body.completed ?? body.completedExpedient);
  }
  if (body.quick_expedient !== undefined || body.quickExpedient !== undefined) {
    patch.quick_expedient = Boolean(body.quick_expedient ?? body.quickExpedient);
  }
  return patch;
}

export function bodyToSaleInsert(
  body: Record<string, unknown>,
  userId: string,
  defaultProspectId?: string
): Record<string, unknown> | null {
  const prospectId = (body.prospect_id ?? body.prospectId ?? defaultProspectId) as string;
  if (!isUuid(prospectId)) return null;
  const saleDate = toDateOrNull(body.sale_date ?? body.date ?? body.saleDate);
  if (!saleDate) return null;
  return {
    id: isUuid(body.id) ? body.id : isUuid(body.saleId) ? body.saleId : generateSaleId(),
    user_id: userId,
    prospect_id: prospectId,
    sale_date: saleDate,
    vol: Number(body.vol ?? 0) || 0,
    tours: Math.max(1, Math.trunc(Number(body.tours ?? 1) || 1)),
    contract: body.contract ?? null,
    status: sanitizeStatus(body.status),
    processing: body.processing ?? (body.status === "pendiente" ? "pendiente" : "venta"),
    process_date: toDateOrNull(body.process_date ?? body.processDate),
    add_processing_followup: Boolean(body.add_processing_followup ?? body.addProcessingFollowup ?? false),
    note: body.note ?? null,
  };
}

export function bodyToCalInsert(body: Record<string, unknown>, userId: string): Record<string, unknown> | null {
  const type = sanitizeEntryType(body.type ?? body.t);
  const entryDate = toDateOrNull(body.entry_date ?? body.entryDate ?? body.date);
  if (!type || !entryDate) return null;
  return {
    id: isUuid(body.id) ? body.id : generateEntryId(),
    user_id: userId,
    prospect_id: isUuid(body.prospect_id ?? body.prospectId ?? body.clientId) ? (body.prospect_id ?? body.prospectId ?? body.clientId) : null,
    sale_id: isUuid(body.sale_id ?? body.saleId) ? (body.sale_id ?? body.saleId) : null,
    type,
    entry_date: entryDate,
    note: body.note ?? null,
    vol: body.vol != null ? Number(body.vol) : null,
    tours: body.tours != null ? Math.trunc(Number(body.tours)) : null,
    contract: body.contract ?? null,
    source: body.source ?? null,
    status: sanitizeStatus(body.status),
    processing: body.processing ?? null,
    process_date: toDateOrNull(body.process_date ?? body.processDate),
    completed: Boolean(body.completed ?? false),
    kind: body.kind ?? null,
    client_name: body.client_name ?? body.clientName ?? null,
  };
}

export function bodyToGoalUpsert(body: Record<string, unknown>, userId: string): Record<string, unknown> | null {
  const year = Math.trunc(Number(body.year));
  const month = Math.trunc(Number(body.month));
  if (!year || month < 0 || month > 11) return null;
  return {
    user_id: userId,
    year,
    month,
    vol: Number(body.vol ?? 0) || 0,
    tours: Math.trunc(Number(body.tours ?? 0) || 0),
    ventas: Math.trunc(Number(body.ventas ?? 0) || 0),
    dias: Math.trunc(Number(body.dias ?? 0) || 0),
    descansos: Math.trunc(Number(body.descansos ?? body.desc ?? 0) || 0),
  };
}

export function bodyToActivityInsert(body: Record<string, unknown>, userId: string): Record<string, unknown> | null {
  const type = typeof body.type === "string" ? body.type : null;
  if (!type) return null;
  const prospectRaw = body.prospect_id ?? body.prospectId;
  return {
    id: isUuid(body.id) ? body.id : generateActivityId(),
    user_id: userId,
    prospect_id: isUuid(prospectRaw) ? prospectRaw : null,
    sale_id: isUuid(body.sale_id ?? body.saleId) ? (body.sale_id ?? body.saleId) : null,
    type,
    title: body.title ?? null,
    note: body.note ?? null,
    activity_date: toDateOrNull(body.activity_date ?? body.date),
    source: body.source ?? null,
    vol: body.vol != null ? Number(body.vol) : null,
    tours: body.tours != null ? Math.trunc(Number(body.tours)) : null,
    contract: body.contract ?? null,
  };
}

export function bodyToToolUpsert(body: Record<string, unknown>, userId: string): Record<string, unknown> | null {
  const tool = sanitizeTool(body.tool);
  if (!tool) return null;
  const prospectRaw = body.prospect_id ?? body.prospectId;
  const prospectId = prospectRaw === "libre" || prospectRaw === null || prospectRaw === undefined
    ? null
    : isUuid(prospectRaw) ? prospectRaw : null;
  if (prospectRaw && prospectRaw !== "libre" && !prospectId) return null;
  const data = body.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return { user_id: userId, prospect_id: prospectId, tool, data };
}
