import { isUuid } from "../data/mappers.js";
import { generateClientId, generateEntryId, generateProspectCode, generateSaleId, generateActivityId } from "../ids.js";
const STATUSES = /* @__PURE__ */ new Set([
  "venta",
  "bback",
  "procesable",
  "no-procesable",
  "perdido",
  "cerrado",
  "procesado"
]);
const ENTRY_TYPES = /* @__PURE__ */ new Set(["venta", "nota", "follow", "descanso"]);
const TOOLS = /* @__PURE__ */ new Set(["survey", "vacaciones", "worksheet"]);
function sanitizeStatus(v) {
  return typeof v === "string" && STATUSES.has(v) ? v : null;
}
function sanitizeEntryType(v) {
  return typeof v === "string" && ENTRY_TYPES.has(v) ? v : null;
}
function sanitizeTool(v) {
  return typeof v === "string" && TOOLS.has(v) ? v : null;
}
function toDateOrNull(v) {
  if (typeof v !== "string") return null;
  const s = v.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
function bodyToProspectInsert(body, userId) {
  const id = isUuid(body.id) ? String(body.id) : generateClientId();
  return {
    id,
    user_id: userId,
    prospect_code: typeof body.prospect_code === "string" && body.prospect_code || typeof body.prospectCode === "string" && body.prospectCode || generateProspectCode(id),
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
    completed: Boolean(body.completed ?? body.completedExpedient ?? false),
    quick_expedient: Boolean(body.quick_expedient ?? body.quickExpedient ?? false)
  };
}
function bodyToProspectPatch(body) {
  const patch = {};
  const map = [
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
    ["note", ["note"]]
  ];
  for (const [col, keys] of map) {
    for (const k of keys) {
      if (body[k] !== void 0) {
        patch[col] = body[k];
        break;
      }
    }
  }
  if (body.status !== void 0) patch.status = sanitizeStatus(body.status);
  if (body.tour_date !== void 0 || body.tourDate !== void 0) {
    patch.tour_date = toDateOrNull(body.tour_date ?? body.tourDate);
  }
  if (body.process_date !== void 0 || body.processDate !== void 0) {
    patch.process_date = toDateOrNull(body.process_date ?? body.processDate);
  }
  if (body.process_amount !== void 0 || body.processAmount !== void 0) {
    patch.process_amount = Number(body.process_amount ?? body.processAmount ?? 0) || 0;
  }
  if (body.completed !== void 0 || body.completedExpedient !== void 0) {
    patch.completed = Boolean(body.completed ?? body.completedExpedient);
  }
  if (body.quick_expedient !== void 0 || body.quickExpedient !== void 0) {
    patch.quick_expedient = Boolean(body.quick_expedient ?? body.quickExpedient);
  }
  return patch;
}
function bodyToSaleInsert(body, userId, defaultProspectId) {
  const prospectId = body.prospect_id ?? body.prospectId ?? defaultProspectId;
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
    processing: body.processing ?? (body.status === "no-procesable" ? "pendiente" : "procesable"),
    process_date: toDateOrNull(body.process_date ?? body.processDate),
    add_processing_followup: Boolean(body.add_processing_followup ?? body.addProcessingFollowup ?? false),
    note: body.note ?? null
  };
}
function bodyToCalInsert(body, userId) {
  const type = sanitizeEntryType(body.type ?? body.t);
  const entryDate = toDateOrNull(body.entry_date ?? body.entryDate ?? body.date);
  if (!type || !entryDate) return null;
  return {
    id: isUuid(body.id) ? body.id : generateEntryId(),
    user_id: userId,
    prospect_id: isUuid(body.prospect_id ?? body.prospectId ?? body.clientId) ? body.prospect_id ?? body.prospectId ?? body.clientId : null,
    sale_id: isUuid(body.sale_id ?? body.saleId) ? body.sale_id ?? body.saleId : null,
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
    client_name: body.client_name ?? body.clientName ?? null
  };
}
function bodyToGoalUpsert(body, userId) {
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
    descansos: Math.trunc(Number(body.descansos ?? body.desc ?? 0) || 0)
  };
}
function bodyToActivityInsert(body, userId) {
  const type = typeof body.type === "string" ? body.type : null;
  if (!type) return null;
  const prospectRaw = body.prospect_id ?? body.prospectId;
  return {
    id: isUuid(body.id) ? body.id : generateActivityId(),
    user_id: userId,
    prospect_id: isUuid(prospectRaw) ? prospectRaw : null,
    sale_id: isUuid(body.sale_id ?? body.saleId) ? body.sale_id ?? body.saleId : null,
    type,
    title: body.title ?? null,
    note: body.note ?? null,
    activity_date: toDateOrNull(body.activity_date ?? body.date),
    source: body.source ?? null,
    vol: body.vol != null ? Number(body.vol) : null,
    tours: body.tours != null ? Math.trunc(Number(body.tours)) : null,
    contract: body.contract ?? null
  };
}
function bodyToToolUpsert(body, userId) {
  const tool = sanitizeTool(body.tool);
  if (!tool) return null;
  const prospectRaw = body.prospect_id ?? body.prospectId;
  const prospectId = prospectRaw === "libre" || prospectRaw === null || prospectRaw === void 0 ? null : isUuid(prospectRaw) ? prospectRaw : null;
  if (prospectRaw && prospectRaw !== "libre" && !prospectId) return null;
  const data = body.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return { user_id: userId, prospect_id: prospectId, tool, data };
}
export {
  bodyToActivityInsert,
  bodyToCalInsert,
  bodyToGoalUpsert,
  bodyToProspectInsert,
  bodyToProspectPatch,
  bodyToSaleInsert,
  bodyToToolUpsert,
  sanitizeEntryType,
  sanitizeStatus,
  sanitizeTool,
  toDateOrNull
};
