import { fmt, parseMoney } from "@/lib/format/money";

/** Claves legacy del HTML original → clave canónica actual. */
const LEGACY_ALIASES: Record<string, string> = {
  wc: "we",
  wo1n: "wo1m",
  wo2n: "wo2m",
  wo3n: "wo3m",
};

type FieldKind = "money" | "percent" | "months";

const FIELD_META: Record<string, { label: string; kind: FieldKind }> = {
  wv: { label: "Monto de venta", kind: "money" },
  we: { label: "% Enganche", kind: "percent" },
  wcc: { label: "Costo de contrato", kind: "money" },
  wob: { label: "Balance anterior", kind: "money" },
  wo1m: { label: "Opción 1 — Meses", kind: "months" },
  wo1r: { label: "Opción 1 — Interés anual", kind: "percent" },
  wo2m: { label: "Opción 2 — Meses", kind: "months" },
  wo2r: { label: "Opción 2 — Interés anual", kind: "percent" },
  wo3m: { label: "Opción 3 — Meses", kind: "months" },
  wo3r: { label: "Opción 3 — Interés anual", kind: "percent" },
};

const FIELD_ORDER = [
  "wv", "we", "wcc", "wob",
  "wo1m", "wo1r", "wo2m", "wo2r", "wo3m", "wo3r",
];

export function worksheetFieldLabel(key: string): string {
  const canonical = LEGACY_ALIASES[key] ?? key;
  return FIELD_META[canonical]?.label ?? key;
}

export function formatWorksheetValue(key: string, value: unknown): string {
  if (value == null || value === "") return "—";
  const canonical = LEGACY_ALIASES[key] ?? key;
  const meta = FIELD_META[canonical];
  const raw = String(value).trim();

  if (!meta) {
    if (typeof value === "boolean") return value ? "Sí" : "No";
    if (typeof value === "object") return JSON.stringify(value);
    return raw;
  }

  const num = parseMoney(raw);
  switch (meta.kind) {
    case "money":
      return fmt(num);
    case "percent":
      return `${raw.replace(/,/g, "")}%`;
    case "months": {
      const m = Math.round(num);
      return m === 1 ? "1 mes" : `${m} meses`;
    }
  }
}

/** Normaliza claves legacy y ordena campos conocidos primero. */
export function worksheetDisplayEntries(
  data: Record<string, unknown>
): { key: string; label: string; value: string }[] {
  const merged = new Map<string, unknown>();

  for (const [key, val] of Object.entries(data)) {
    const canonical = LEGACY_ALIASES[key] ?? key;
    if (!merged.has(canonical)) merged.set(canonical, val);
  }

  const known = FIELD_ORDER
    .filter((k) => merged.has(k))
    .map((k) => ({
      key: k,
      label: worksheetFieldLabel(k),
      value: formatWorksheetValue(k, merged.get(k)),
    }));

  const unknown = [...merged.keys()]
    .filter((k) => !FIELD_ORDER.includes(k))
    .sort()
    .map((k) => ({
      key: k,
      label: worksheetFieldLabel(k),
      value: formatWorksheetValue(k, merged.get(k)),
    }));

  return [...known, ...unknown];
}
