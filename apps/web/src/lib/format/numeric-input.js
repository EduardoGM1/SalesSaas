import { onlyDigits } from "@/lib/format/money";

/** Formatea dígitos con comas mientras el usuario escribe (solo visual). */
export function formatDigitsWithCommas(value, locale = "en-US") {
  const digits = onlyDigits(value);
  if (!digits) return "";
  return Number(digits).toLocaleString(locale, { maximumFractionDigits: 0 });
}

/** Normaliza entrada numérica con decimales opcionales y comas visuales. */
export function formatDecimalInput(value, locale = "en-US") {
  const raw = String(value ?? "").replace(/,/g, "");
  if (raw === "" || raw === "." || raw === "-") return raw;
  const parts = raw.split(".");
  const intPart = onlyDigits(parts[0]);
  const decPart = parts[1] != null ? parts[1].replace(/[^\d]/g, "") : null;
  if (!intPart && decPart == null) return raw.startsWith(".") ? "." : "";
  const formattedInt = intPart
    ? Number(intPart).toLocaleString(locale, { maximumFractionDigits: 0 })
    : "0";
  if (decPart == null) return formattedInt;
  return `${formattedInt}.${decPart}`;
}

/** Entrada monetaria con miles automáticos y máximo 2 decimales (mientras escribe). */
export function formatMoneyInput(raw, locale = "en-US") {
  const clean = String(raw ?? "").replace(/[^\d.]/g, "");
  if (!clean) return "";
  const [intPart, decPart] = clean.split(".");
  const withCommas = Number(intPart || "0").toLocaleString(locale);
  return decPart !== undefined ? `${withCommas}.${decPart.slice(0, 2)}` : withCommas;
}
