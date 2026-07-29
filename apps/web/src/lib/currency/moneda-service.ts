import { parseMoney } from "@/lib/format/money";

export const CAPTURE_CURRENCIES = ["USD", "MXN"] as const;
export type CaptureCurrency = (typeof CAPTURE_CURRENCIES)[number];
export type MonedaCode = "USD" | "MXN" | "CAD" | "EUR";

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

export interface MonedaContext {
  monedaOperativa: MonedaCode;
  /** 1 USD = X MXN */
  usdToMxn: number;
  /** 1 USD = X moneda operativa (1 si USD) */
  operationalFromUsd: number;
}

export interface MonedaSettingsLike {
  currency?: MonedaCode;
  exchangeRate?: number;
  usdToMxnRate?: number;
}

export function getMonedaContext(settings?: MonedaSettingsLike | null): MonedaContext {
  const monedaOperativa = settings?.currency ?? "USD";
  const operationalFromUsd = monedaOperativa === "USD" ? 1 : Number(settings?.exchangeRate || 1);
  const usdToMxn = monedaOperativa === "MXN"
    ? Number(settings?.exchangeRate || settings?.usdToMxnRate || 18)
    : Number(settings?.usdToMxnRate || settings?.exchangeRate || 18);
  return { monedaOperativa, usdToMxn, operationalFromUsd };
}

/** Convierte entre monedas soportadas (captura USD/MXN u operativa). */
export function convertir(
  monto: number,
  origen: CaptureCurrency | MonedaCode,
  destino: MonedaCode,
  ctx: MonedaContext,
): number {
  if (!Number.isFinite(monto)) return 0;
  if (origen === destino) return monto;

  let usd = monto;
  if (origen === "MXN") usd = monto / ctx.usdToMxn;
  else if (origen === "CAD" || origen === "EUR") usd = monto / ctx.operationalFromUsd;

  if (destino === "USD") return usd;
  if (destino === "MXN") return usd * ctx.usdToMxn;
  return usd * ctx.operationalFromUsd;
}

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
