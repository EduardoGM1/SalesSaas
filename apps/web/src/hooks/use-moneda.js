import { useCallback, useMemo } from "react";
import { useDbStore } from "@/stores/db-store";
import { shallow } from "zustand/shallow";
import {
  buildAmountRecord,
  convertir,
  fmtWithCurrencyCode,
  formatCaptureMoneyValue,
  getMonedaContext,
  resolveOperationalAmount,
} from "@/lib/currency/moneda-service";

/**
 * Moneda de captura + formato de resultados.
 * Los labels de resultado siguen siempre a `captureCurrency` (pestaña activa),
 * no a un "USD" hardcodeado ni solo a la moneda visual de Settings.
 */
export function useMoneda(captureCurrency = "USD") {
  const settings = useDbStore((s) => s.db.settings, shallow);
  const language = settings?.language === "en" ? "en" : "es";
  const ctx = useMemo(() => getMonedaContext(settings), [
    settings?.currency,
    settings?.exchangeRate,
    settings?.usdToMxnRate,
  ]);

  const monedaCaptura = captureCurrency === "MXN" ? "MXN" : "USD";
  const { monedaOperativa } = ctx;

  /** Formatea un monto YA en moneda de captura (pestaña activa). */
  const fmtResult = useCallback(
    (amountInCapture) => fmtWithCurrencyCode(amountInCapture, monedaCaptura, language),
    [monedaCaptura, language],
  );

  /**
   * Formatea un monto en moneda operativa convirtiéndolo a la pestaña activa.
   * Usar con resultados de buildOperationalFields / compute*.
   */
  const fmtOperationalResult = useCallback(
    (amountOperational) => {
      const display = convertir(amountOperational, monedaOperativa, monedaCaptura, ctx);
      return fmtWithCurrencyCode(display, monedaCaptura, language);
    },
    [ctx, monedaCaptura, monedaOperativa, language],
  );

  const fmtResultN = useCallback(
    (amount) => {
      if (!Number.isFinite(amount)) return "0";
      return Number(amount).toLocaleString(language === "en" ? "en-US" : "es-MX", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
    },
    [language],
  );

  const formatCapture = useCallback(
    (value) => formatCaptureMoneyValue(value, language),
    [language],
  );

  const convertirMoneda = useCallback(
    (monto, origen, destino) => convertir(monto, origen ?? monedaCaptura, destino ?? monedaOperativa, ctx),
    [ctx, monedaCaptura, monedaOperativa],
  );

  const toOperational = useCallback(
    (rawValue, meta) => resolveOperationalAmount(rawValue, meta, monedaCaptura, ctx),
    [ctx, monedaCaptura],
  );

  const toCaptureDisplay = useCallback(
    (amountOperational) => convertir(amountOperational, monedaOperativa, monedaCaptura, ctx),
    [ctx, monedaCaptura, monedaOperativa],
  );

  const captureAmountRecord = useCallback(
    (rawValue) => buildAmountRecord(rawValue, monedaCaptura, ctx),
    [ctx, monedaCaptura],
  );

  return {
    ctx,
    monedaCaptura,
    monedaActiva: monedaCaptura,
    monedaOperativa,
    usdToMxn: ctx.usdToMxn,
    language,
    fmtResult: fmtOperationalResult,
    fmtCaptureResult: fmtResult,
    fmtResultN,
    formatCapture,
    convertir: convertirMoneda,
    toOperational,
    toCaptureDisplay,
    captureAmountRecord,
  };
}
