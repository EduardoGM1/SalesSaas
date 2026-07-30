import { useEffect, useState } from "react";
import { useMoneda } from "@/hooks/use-moneda.js";
import {
  convertCaptureMoneyFields,
  normalizeCaptureCurrency,
  parseCurrencyMeta,
  serializeCurrencyMeta,
} from "@/lib/currency/moneda-service";

/**
 * Estado compartido de moneda de captura + metadata histórica por herramienta.
 */
export function useMonedaToolBucket({ getBucket, toolKey, ready, toolsRevision }) {
  const [captureCurrency, setCaptureCurrency] = useState("USD");
  const [currencyMeta, setCurrencyMeta] = useState({});
  const moneda = useMoneda(captureCurrency);

  useEffect(() => {
    if (!ready) return;
    const bucket = getBucket(toolKey);
    setCaptureCurrency(normalizeCaptureCurrency(bucket.captureCurrency));
    setCurrencyMeta(parseCurrencyMeta(bucket.currency_meta));
  }, [ready, getBucket, toolKey, toolsRevision]);

  const appendMonedaPayload = (payload) => ({
    ...payload,
    captureCurrency,
    currency_meta: serializeCurrencyMeta(currencyMeta),
  });

  const resetMoneda = () => {
    setCaptureCurrency("USD");
    setCurrencyMeta({});
  };

  const recordMoneyCapture = (fieldKey, formattedValue) => {
    setCurrencyMeta((prev) => ({
      ...prev,
      [fieldKey]: moneda.captureAmountRecord(formattedValue),
    }));
  };

  /**
   * Cambia pestaña USD/MXN y convierte campos monetarios visibles
   * con el tipo de cambio manual configurado.
   */
  const switchCaptureCurrency = (next, fields, moneyFields, setFields) => {
    const nextCurrency = normalizeCaptureCurrency(next);
    if (nextCurrency === captureCurrency) return;
    const { fields: converted, meta } = convertCaptureMoneyFields(
      fields,
      moneyFields,
      captureCurrency,
      nextCurrency,
      moneda.ctx,
      moneda.language,
    );
    setFields?.(converted);
    setCurrencyMeta((prev) => ({ ...prev, ...meta }));
    setCaptureCurrency(nextCurrency);
  };

  return {
    captureCurrency,
    setCaptureCurrency,
    switchCaptureCurrency,
    currencyMeta,
    currencyMetaSerialized: serializeCurrencyMeta(currencyMeta),
    moneda,
    appendMonedaPayload,
    resetMoneda,
    recordMoneyCapture,
  };
}
