import { useEffect, useState } from "react";
import { useMoneda } from "@/hooks/use-moneda.js";
import {
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

  return {
    captureCurrency,
    setCaptureCurrency,
    currencyMeta,
    currencyMetaSerialized: serializeCurrencyMeta(currencyMeta),
    moneda,
    appendMonedaPayload,
    resetMoneda,
    recordMoneyCapture,
  };
}
