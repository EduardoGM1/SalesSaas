/**
 * Motor de renderizado genérico basado en schema_ui declarativo.
 * Tipos soportados: text, number, boolean, select, textarea, date.
 */
import { EXTENSION_POINTS } from "./extension-points.js";

export { EXTENSION_POINTS };

/**
 * @typedef {{ key: string, label: string, type: string, options?: string[], required?: boolean }} SchemaField
 * @typedef {{ fields?: SchemaField[], title?: string }} ModuleSchema
 */

export function normalizeSchema(schemaUi) {
  const raw = schemaUi && typeof schemaUi === "object" ? schemaUi : {};
  const fields = Array.isArray(raw.fields) ? raw.fields : [];
  return {
    title: typeof raw.title === "string" ? raw.title : "",
    fields: fields
      .filter((f) => f && typeof f.key === "string" && typeof f.type === "string")
      .map((f) => ({
        key: f.key,
        label: f.label || f.key,
        type: f.type,
        options: Array.isArray(f.options) ? f.options : undefined,
        required: !!f.required,
      })),
  };
}

export function emptyValuesFromSchema(schemaUi) {
  const { fields } = normalizeSchema(schemaUi);
  const out = {};
  for (const f of fields) {
    if (f.type === "boolean") out[f.key] = false;
    else if (f.type === "number") out[f.key] = null;
    else out[f.key] = "";
  }
  return out;
}

export function validateAgainstSchema(schemaUi, values) {
  const { fields } = normalizeSchema(schemaUi);
  const errors = {};
  for (const f of fields) {
    const v = values?.[f.key];
    if (f.required && (v == null || v === "")) {
      errors[f.key] = "Requerido";
    }
  }
  return { ok: Object.keys(errors).length === 0, errors };
}
