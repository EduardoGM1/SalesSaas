import { fmt, parseMoney } from "@/lib/format/money";
import { translate } from "@/lib/i18n.js";

/** Claves legacy del HTML original → clave canónica actual. */
const LEGACY_ALIASES: Record<string, string> = {
  wc: "we",
  wo1n: "wo1m",
  wo2n: "wo2m",
  wo3n: "wo3m",
};

type FieldKind = "money" | "percent" | "months";

const FIELD_META: Record<string, { labelKey: string; kind: FieldKind }> = {
  wv: { labelKey: "admin.worksheet.field.wv", kind: "money" },
  we: { labelKey: "admin.worksheet.field.we", kind: "percent" },
  wcc: { labelKey: "admin.worksheet.field.wcc", kind: "money" },
  wob: { labelKey: "admin.worksheet.field.wob", kind: "money" },
  wo1m: { labelKey: "admin.worksheet.field.wo1m", kind: "months" },
  wo1r: { labelKey: "admin.worksheet.field.wo1r", kind: "percent" },
  wo2m: { labelKey: "admin.worksheet.field.wo2m", kind: "months" },
  wo2r: { labelKey: "admin.worksheet.field.wo2r", kind: "percent" },
  wo3m: { labelKey: "admin.worksheet.field.wo3m", kind: "months" },
  wo3r: { labelKey: "admin.worksheet.field.wo3r", kind: "percent" },
};

const FIELD_ORDER = [
  "wv", "we", "wcc", "wob",
  "wo1m", "wo1r", "wo2m", "wo2r", "wo3m", "wo3r",
];

export function worksheetFieldLabel(key: string): string {
  const canonical = LEGACY_ALIASES[key] ?? key;
  const meta = FIELD_META[canonical];
  return meta ? translate(meta.labelKey) : key;
}

export function formatWorksheetValue(key: string, value: unknown): string {
  if (value == null || value === "") return "—";
  const canonical = LEGACY_ALIASES[key] ?? key;
  const meta = FIELD_META[canonical];
  const raw = String(value).trim();

  if (!meta) {
    if (typeof value === "boolean") return value ? translate("admin.worksheet.yes") : translate("admin.worksheet.no");
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
      return m === 1 ? translate("admin.worksheet.monthOne") : translate("admin.worksheet.months", { n: m });
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
