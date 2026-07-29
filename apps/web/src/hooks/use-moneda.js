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

export function useMoneda(captureCurrency = "USD") {
  const settings = useDbStore((s) => s.db.settings, shallow);
  const ctx = useMemo(() => getMonedaContext(settings), [
    settings?.currency,
    settings?.exchangeRate,
    settings?.usdToMxnRate,
  ]);

  const monedaCaptura = captureCurrency === "MXN" ? "MXN" : "USD";
  const { monedaOperativa } = ctx;

  const fmtResult = useCallback(
    (amount) => fmtWithCurrencyCode(amount, monedaOperativa, settings?.language ?? "es"),
    [monedaOperativa, settings?.language],
  );

  const fmtResultN = useCallback(
    (amount) => {
      if (!Number.isFinite(amount)) return "0";
      return Number(amount).toLocaleString(settings?.language === "en" ? "en-US" : "es-MX", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
    },
    [settings?.language],
  );

  const formatCapture = useCallback(
    (value) => formatCaptureMoneyValue(value, settings?.language ?? "es"),
    [settings?.language],
  );

  const convertirMoneda = useCallback(
    (monto, origen, destino) => convertir(monto, origen ?? monedaCaptura, destino ?? monedaOperativa, ctx),
    [ctx, monedaCaptura, monedaOperativa],
  );

  const toOperational = useCallback(
    (rawValue, meta) => resolveOperationalAmount(rawValue, meta, monedaCaptura, ctx),
    [ctx, monedaCaptura],
  );

  const captureAmountRecord = useCallback(
    (rawValue) => buildAmountRecord(rawValue, monedaCaptura, ctx),
    [ctx, monedaCaptura],
  );

  return {
    ctx,
    monedaCaptura,
    monedaOperativa,
    usdToMxn: ctx.usdToMxn,
    fmtResult,
    fmtResultN,
    formatCapture,
    convertir: convertirMoneda,
    toOperational,
    captureAmountRecord,
  };
}
