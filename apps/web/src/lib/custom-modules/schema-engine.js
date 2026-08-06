/**
 * Motor declarativo schema_ui — normalización + validación.
 * El render vive en SchemaForm; aquí no hay React.
 */
import { EXTENSION_POINTS } from "./extension-points.js";

export { EXTENSION_POINTS };

export const FIELD_TYPES = Object.freeze([
  "text",
  "textarea",
  "number",
  "date",
  "currency",
  "checkbox",
  "boolean",
  "switch",
  "select",
  "radio",
  "autocomplete",
  "file",
  "section",
  "tabs",
]);

/**
 * @typedef {{
 *   key?: string,
 *   label?: string,
 *   type: string,
 *   options?: Array<string|{value:string,label:string}>,
 *   required?: boolean,
 *   placeholder?: string,
 *   help?: string,
 *   min?: number,
 *   max?: number,
 *   step?: number,
 *   pattern?: string,
 *   accept?: string,
 *   fields?: object[],
 *   tabs?: Array<{ key: string, label: string, fields?: object[] }>,
 *   layout?: 'stack'|'grid'|'inline',
 *   colSpan?: number,
 * }} SchemaField
 * @typedef {{ title?: string, description?: string, layout?: string, fields?: SchemaField[], sections?: SchemaField[] }} ModuleSchema
 */

function normalizeOption(opt) {
  if (typeof opt === "string") return { value: opt, label: opt };
  if (opt && typeof opt === "object" && opt.value != null) {
    return { value: String(opt.value), label: String(opt.label ?? opt.value) };
  }
  return null;
}

function normalizeField(f) {
  if (!f || typeof f.type !== "string") return null;
  const type = f.type === "boolean" ? "checkbox" : f.type;
  if (!FIELD_TYPES.includes(type) && type !== "checkbox") return null;

  const base = {
    key: typeof f.key === "string" ? f.key : undefined,
    label: f.label || f.key || "",
    type,
    required: !!f.required,
    placeholder: typeof f.placeholder === "string" ? f.placeholder : undefined,
    help: typeof f.help === "string" ? f.help : undefined,
    min: typeof f.min === "number" ? f.min : undefined,
    max: typeof f.max === "number" ? f.max : undefined,
    step: typeof f.step === "number" ? f.step : undefined,
    pattern: typeof f.pattern === "string" ? f.pattern : undefined,
    accept: typeof f.accept === "string" ? f.accept : undefined,
    layout: f.layout === "grid" || f.layout === "inline" ? f.layout : "stack",
    colSpan: typeof f.colSpan === "number" ? f.colSpan : undefined,
    options: Array.isArray(f.options)
      ? f.options.map(normalizeOption).filter(Boolean)
      : undefined,
  };

  if (type === "section") {
    return {
      ...base,
      key: base.key || `section_${base.label || "block"}`,
      fields: Array.isArray(f.fields)
        ? f.fields.map(normalizeField).filter(Boolean)
        : [],
    };
  }

  if (type === "tabs") {
    return {
      ...base,
      key: base.key || "tabs",
      tabs: Array.isArray(f.tabs)
        ? f.tabs
          .filter((t) => t && typeof t.key === "string")
          .map((t) => ({
            key: t.key,
            label: t.label || t.key,
            fields: Array.isArray(t.fields)
              ? t.fields.map(normalizeField).filter(Boolean)
              : [],
          }))
        : [],
    };
  }

  if (!base.key) return null;
  return base;
}

/** Aplana campos (incluye sections/tabs) para defaults/validación. */
export function flattenFields(fields) {
  const out = [];
  for (const f of fields || []) {
    if (f.type === "section") out.push(...flattenFields(f.fields));
    else if (f.type === "tabs") {
      for (const tab of f.tabs || []) out.push(...flattenFields(tab.fields));
    } else out.push(f);
  }
  return out;
}

export function normalizeSchema(schemaUi) {
  const raw = schemaUi && typeof schemaUi === "object" ? schemaUi : {};
  const fromFields = Array.isArray(raw.fields) ? raw.fields : [];
  const fromSections = Array.isArray(raw.sections) ? raw.sections : [];
  const fields = [...fromFields, ...fromSections].map(normalizeField).filter(Boolean);
  return {
    title: typeof raw.title === "string" ? raw.title : "",
    description: typeof raw.description === "string" ? raw.description : "",
    layout: raw.layout === "grid" ? "grid" : "stack",
    fields,
  };
}

export function emptyValuesFromSchema(schemaUi) {
  const { fields } = normalizeSchema(schemaUi);
  const out = {};
  for (const f of flattenFields(fields)) {
    if (f.type === "checkbox" || f.type === "switch") out[f.key] = false;
    else if (f.type === "number" || f.type === "currency") out[f.key] = null;
    else if (f.type === "file") out[f.key] = null;
    else out[f.key] = "";
  }
  return out;
}

export function validateAgainstSchema(schemaUi, values) {
  const { fields } = normalizeSchema(schemaUi);
  const errors = {};
  for (const f of flattenFields(fields)) {
    const v = values?.[f.key];
    const empty = v == null || v === "" || (Array.isArray(v) && !v.length);
    if (f.required) {
      if (f.type === "checkbox" || f.type === "switch") {
        if (v !== true) errors[f.key] = "Requerido";
      } else if (empty) {
        errors[f.key] = "Requerido";
      }
    }
    if ((f.type === "number" || f.type === "currency") && !empty) {
      if (Number.isNaN(Number(v))) errors[f.key] = "Número inválido";
      else {
        const n = Number(v);
        if (f.min != null && n < f.min) errors[f.key] = `Mínimo ${f.min}`;
        if (f.max != null && n > f.max) errors[f.key] = `Máximo ${f.max}`;
      }
    }
    if (f.pattern && !empty) {
      try {
        if (!new RegExp(f.pattern).test(String(v))) errors[f.key] = "Formato inválido";
      } catch {
        /* pattern inválido en schema: ignorar */
      }
    }
  }
  return { ok: Object.keys(errors).length === 0, errors };
}
