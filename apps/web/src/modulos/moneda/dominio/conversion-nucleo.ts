/**
 * Dominio puro de conversión monetaria (sin I/O ni parseo de UI).
 * Claves persistidas (currency, exchangeRate, usdToMxnRate, …) no se renombran.
 */
import { normalizeUsdToMxnRate } from "./normalizar-tasa-usd-mxn.js";

export const CAPTURE_CURRENCIES = ["USD", "MXN"] as const;
export type CaptureCurrency = (typeof CAPTURE_CURRENCIES)[number];
export type MonedaCode = "USD" | "MXN" | "CAD" | "EUR";

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

export { normalizeUsdToMxnRate };

/** 1 USD = X MXN — nunca usar exchangeRate=1 de salas en USD como TC MXN. */
export function resolveUsdToMxnRate(settings?: MonedaSettingsLike | null): number {
  const dedicated = normalizeUsdToMxnRate(settings?.usdToMxnRate);
  if (dedicated != null) return dedicated;
  if (settings?.currency === "MXN") {
    const er = Number(settings?.exchangeRate);
    if (Number.isFinite(er) && er > 1) return er;
  }
  return 18;
}

/** TC captura USD→MXN ≤ 1 es casi siempre un error de configuración. */
export function isUnusualUsdToMxnRate(rate: number | null | undefined): boolean {
  const n = Number(rate);
  return Number.isFinite(n) && n > 0 && n <= 1;
}

export function unusualUsdToMxnRateMessage(_rate?: number | null): string | null {
  return "Tipo de cambio inusual: 1 USD = 1 MXN";
}

export function getMonedaContext(settings?: MonedaSettingsLike | null): MonedaContext {
  const monedaOperativa = settings?.currency ?? "USD";
  const usdToMxn = resolveUsdToMxnRate(settings);
  const operationalFromUsd = monedaOperativa === "USD"
    ? 1
    : Number(settings?.exchangeRate || usdToMxn);
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

/** Normaliza la tasa manual a "1 USD = X MXN" a partir de montos capturados. */
export function resolveUsdToMxnRateFromAmounts(
  baseCurrency: CaptureCurrency,
  quoteCurrency: CaptureCurrency,
  baseAmount: number,
  quoteAmount: number,
): number {
  const base = Number(baseAmount);
  const quote = Number(quoteAmount);
  if (!Number.isFinite(base) || !Number.isFinite(quote) || base <= 0 || quote <= 0) return 18;
  if (baseCurrency === "USD" && quoteCurrency === "MXN") return quote / base;
  if (baseCurrency === "MXN" && quoteCurrency === "USD") return base / quote;
  if (baseCurrency === quoteCurrency) return 18;
  return quote / base;
}
