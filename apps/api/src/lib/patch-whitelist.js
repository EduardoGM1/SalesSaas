/**
 * Whitelists para PATCH de ventas / actividades / agenda.
 *
 * Los INSERT ya pasan por `bodyTo*Insert` (packages/shared/api/validators.js);
 * los PATCH copiaban `{...body}` y permitían fijar `workspace_id`, `prospect_id`,
 * `created_at`, etc. (mass assignment). Aquí solo pasan columnas editables, con
 * la misma normalización que los inserts.
 */
import { isUuid } from "@salesapp/shared/data/mappers.js";
import { sanitizeEntryType, sanitizeStatus, toDateOrNull } from "@salesapp/shared/api/validators.js";
import { ServiceError } from "./service-error.js";

const num = (v) => (v == null ? null : Number(v) || 0);
const int = (v) => (v == null ? null : Math.trunc(Number(v) || 0));
const str = (v) => (v == null ? null : String(v));
const bool = (v) => Boolean(v);
const uuidOrNull = (v) => (isUuid(v) ? v : null);

/**
 * @param {Record<string, unknown>} body
 * @param {Record<string, { keys: string[], map: (v: unknown) => unknown }>} spec
 */
function buildPatch(body, spec) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ServiceError("Body inválido.", 400);
  }
  const patch = {};
  for (const [column, { keys, map }] of Object.entries(spec)) {
    for (const key of keys) {
      if (body[key] !== undefined) {
        patch[column] = map(body[key]);
        break;
      }
    }
  }
  if (Object.keys(patch).length === 0) {
    throw new ServiceError("Sin campos editables en el body.", 400);
  }
  return patch;
}

export function saleToPatch(body) {
  return buildPatch(body, {
    sale_date: { keys: ["sale_date", "date", "saleDate"], map: toDateOrNull },
    vol: { keys: ["vol"], map: num },
    tours: { keys: ["tours"], map: (v) => Math.max(1, int(v) ?? 1) },
    contract: { keys: ["contract"], map: str },
    status: { keys: ["status"], map: sanitizeStatus },
    processing: { keys: ["processing"], map: str },
    process_date: { keys: ["process_date", "processDate"], map: toDateOrNull },
    add_processing_followup: { keys: ["add_processing_followup", "addProcessingFollowup"], map: bool },
    note: { keys: ["note"], map: str },
  });
}

export function activityToPatch(body) {
  return buildPatch(body, {
    type: { keys: ["type"], map: str },
    title: { keys: ["title"], map: str },
    note: { keys: ["note"], map: str },
    activity_date: { keys: ["activity_date", "date"], map: toDateOrNull },
    source: { keys: ["source"], map: str },
    vol: { keys: ["vol"], map: num },
    tours: { keys: ["tours"], map: int },
    contract: { keys: ["contract"], map: str },
    sale_id: { keys: ["sale_id", "saleId"], map: uuidOrNull },
  });
}

export function calendarEntryToPatch(body) {
  return buildPatch(body, {
    type: { keys: ["type", "t"], map: sanitizeEntryType },
    entry_date: { keys: ["entry_date", "entryDate", "date"], map: toDateOrNull },
    note: { keys: ["note"], map: str },
    vol: { keys: ["vol"], map: num },
    tours: { keys: ["tours"], map: int },
    contract: { keys: ["contract"], map: str },
    source: { keys: ["source"], map: str },
    status: { keys: ["status"], map: sanitizeStatus },
    processing: { keys: ["processing"], map: str },
    process_date: { keys: ["process_date", "processDate"], map: toDateOrNull },
    completed: { keys: ["completed"], map: bool },
    kind: { keys: ["kind"], map: str },
    client_name: { keys: ["client_name", "clientName"], map: str },
    sale_id: { keys: ["sale_id", "saleId"], map: uuidOrNull },
  });
}
