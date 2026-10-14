import { parseMoney } from "@/lib/format/money";
import {
  type CaptureCurrency,
  type MonedaCode,
  type MonedaContext,
  type MonedaSettingsLike,
  CAPTURE_CURRENCIES,
  convertir,
  getMonedaContext,
  isUnusualUsdToMxnRate,
  normalizeUsdToMxnRate,
  resolveUsdToMxnRate,
  resolveUsdToMxnRateFromAmounts,
  unusualUsdToMxnRateMessage,
} from "../dominio/conversion-nucleo";

export type { CaptureCurrency, MonedaCode, MonedaContext, MonedaSettingsLike };
export {
  CAPTURE_CURRENCIES,
  convertir,
  getMonedaContext,
  isUnusualUsdToMxnRate,
  normalizeUsdToMxnRate,
  resolveUsdToMxnRate,
  resolveUsdToMxnRateFromAmounts,
  unusualUsdToMxnRateMessage,
};

export interface AmountRecord {
  monto_original: number;
  moneda_original: CaptureCurrency;
  /** 1 USD = X MXN al momento de capturar */
  tipo_cambio_usado: number;
  monto_convertido: number;
  moneda_operativa_destino: MonedaCode;
  fecha_tipo_cambio: string;
}

export type CurrencyMetaMap = Record<string, AmountRecord>;

export function buildAmountRecord(
  rawValue: string | number | undefined,
  captureCurrency: CaptureCurrency,
  ctx: MonedaContext,
): AmountRecord {
  const monto_original = parseMoney(rawValue);
  const monto_convertido = convertir(monto_original, captureCurrency, ctx.monedaOperativa, ctx);
  return {
    monto_original,
    moneda_original: captureCurrency,
    tipo_cambio_usado: ctx.usdToMxn,
    monto_convertido,
    moneda_operativa_destino: ctx.monedaOperativa,
    fecha_tipo_cambio: new Date().toISOString(),
  };
}

/** Usa el snapshot histórico si existe; no recalcula con TC nuevo. */
export function resolveOperationalAmount(
  rawValue: string | number | undefined,
  meta: AmountRecord | undefined,
  captureCurrency: CaptureCurrency,
  ctx: MonedaContext,
): number {
  if (
    meta?.monto_convertido != null
    && Number.isFinite(meta.monto_convertido)
    && meta.moneda_operativa_destino === ctx.monedaOperativa
  ) {
    return meta.monto_convertido;
  }
  return convertir(parseMoney(rawValue), captureCurrency, ctx.monedaOperativa, ctx);
}

export function parseCurrencyMeta(raw: unknown): CurrencyMetaMap {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as CurrencyMetaMap;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed ? parsed as CurrencyMetaMap : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function serializeCurrencyMeta(meta: CurrencyMetaMap): string {
  return JSON.stringify(meta || {});
}

export function normalizeCaptureCurrency(raw: unknown): CaptureCurrency {
  return raw === "MXN" ? "MXN" : "USD";
}

export function formatCaptureMoneyValue(
  rawValue: string | number | undefined,
  language: "es" | "en" = "es",
): string {
  const raw = String(rawValue ?? "").replace(/[^0-9.\-]/g, "");
  if (raw === "" || raw === "-" || raw === ".") return "";
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString(language === "en" ? "en-US" : "es-MX", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function fmtWithCurrencyCode(
  amount: number,
  currency: MonedaCode | CaptureCurrency,
  language: "es" | "en" = "es",
): string {
  if (!Number.isFinite(amount)) return `${currency} 0`;
  const formatted = amount.toLocaleString(language === "en" ? "en-US" : "es-MX", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${currency} ${formatted}`;
}

export const SURVEY_MONEY_FIELDS = ["total", "sh1a", "sh2a", "sh3a", "sf1a", "sf2a", "sf3a"] as const;
export const VACACIONES_MONEY_FIELDS = ["vc"] as const;
export const WORKSHEET_MONEY_FIELDS = ["wv", "wcc", "wob"] as const;
export const RH_WORKSHEET_MONEY_FIELDS = [
  "monto_venta",
  "valor",
  "enganche_hoy",
  "gasto_adm_hoy",
  "tarjeta_inmex",
  "tarjeta_rci",
] as const;

export function buildOperationalFields<T extends Record<string, unknown>>(
  data: T,
  meta: CurrencyMetaMap,
  captureCurrency: CaptureCurrency,
  ctx: MonedaContext,
  moneyFields: readonly string[],
): T {
  const out = { ...data };
  for (const key of moneyFields) {
    (out as Record<string, unknown>)[key] = resolveOperationalAmount(
      data[key] as string | number | undefined,
      meta[key],
      captureCurrency,
      ctx,
    );
  }
  return out;
}

/**
 * Convierte campos monetarios de captura al cambiar pestaña USD↔MXN.
 * No reescribe históricos ya persistidos fuera de esta sesión: opera sobre
 * los valores visibles actuales y regenera snapshots de currency_meta.
 */
export function convertCaptureMoneyFields<T extends Record<string, unknown>>(
  data: T,
  moneyFields: readonly string[],
  from: CaptureCurrency,
  to: CaptureCurrency,
  ctx: MonedaContext,
  language: "es" | "en" = "es",
): { fields: T; meta: CurrencyMetaMap } {
  if (from === to) {
    return { fields: data, meta: {} };
  }
  const fields = { ...data };
  const meta: CurrencyMetaMap = {};
  for (const key of moneyFields) {
    const raw = data[key];
    const n = parseMoney(raw as string | number | undefined);
    if (!Number.isFinite(n) || String(raw ?? "").trim() === "") {
      (fields as Record<string, unknown>)[key] = raw;
      continue;
    }
    const converted = convertir(n, from, to, ctx);
    const formatted = formatCaptureMoneyValue(converted, language);
    (fields as Record<string, unknown>)[key] = formatted;
    meta[key] = buildAmountRecord(formatted, to, ctx);
  }
  return { fields, meta };
}
