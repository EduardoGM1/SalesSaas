import { useCallback, useEffect, useState } from "react";
import { useMoneda } from "@/hooks/use-moneda.js";
import { saveSettingsPatchRemote } from "@/actions/settings.js";
import { useDbStore } from "@/stores/db-store";
import {
  convertCaptureMoneyFields,
  normalizeCaptureCurrency,
  parseCurrencyMeta,
  serializeCurrencyMeta,
} from "@/lib/currency/moneda-service";
import { refreshRhCurrencyMeta } from "@/lib/currency/rh-form-currency.js";

/**
 * Moneda de captura por herramienta, sincronizada con preferencia GLOBAL
 * (`settings.activeCaptureCurrency`) para Vacaciones / Survey / Worksheet.
 */
export function useMonedaToolBucket({ getBucket, toolKey, ready, toolsRevision }) {
  const settingsCurrency = useDbStore(
    (s) => normalizeCaptureCurrency(s.db.settings?.activeCaptureCurrency || "USD"),
  );
  const [captureCurrency, setCaptureCurrency] = useState(settingsCurrency);
  const [currencyMeta, setCurrencyMeta] = useState({});
  const moneda = useMoneda(captureCurrency);

  useEffect(() => {
    if (!ready) return;
    const bucket = getBucket(toolKey);
    const preferred = normalizeCaptureCurrency(
      settingsCurrency || bucket.captureCurrency || "USD",
    );
    setCaptureCurrency(preferred);
    setCurrencyMeta(parseCurrencyMeta(bucket.currency_meta));
    // settingsCurrency intencional fuera de deps: al cambiar moneda en esta pantalla
    // no debemos pisar currency_meta local con el bucket aún no guardado.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate on tool load only
  }, [ready, getBucket, toolKey, toolsRevision]);

  const appendMonedaPayload = (payload) => ({
    ...payload,
    captureCurrency,
    currency_meta: serializeCurrencyMeta(currencyMeta),
  });

  const resetMoneda = () => {
    setCaptureCurrency(settingsCurrency || "USD");
    setCurrencyMeta({});
  };

  const recordMoneyCapture = (fieldKey, formattedValue) => {
    setCurrencyMeta((prev) => ({
      ...prev,
      [fieldKey]: moneda.captureAmountRecord(formattedValue),
    }));
  };

  /** Alinea campos cargados del bucket a la moneda global activa. */
  const alignLoadedFields = useCallback((loadedFields, moneyFields) => {
    const bucket = getBucket(toolKey);
    const from = normalizeCaptureCurrency(bucket.captureCurrency || "USD");
    const to = normalizeCaptureCurrency(settingsCurrency || from);
    setCaptureCurrency(to);
    if (from === to || !moneyFields?.length) {
      setCurrencyMeta(parseCurrencyMeta(bucket.currency_meta));
      return loadedFields;
    }
    const { fields, meta } = convertCaptureMoneyFields(
      loadedFields,
      moneyFields,
      from,
      to,
      moneda.ctx,
      moneda.language,
    );
    setCurrencyMeta({ ...parseCurrencyMeta(bucket.currency_meta), ...meta });
    return fields;
  }, [getBucket, toolKey, settingsCurrency, moneda.ctx, moneda.language]);

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

    void saveSettingsPatchRemote(
      { activeCaptureCurrency: nextCurrency, exchangeMode: "manual" },
      { silent: true },
    ).catch(() => {});
  };

  const applyCaptureCurrency = (next, metaPatch = {}) => {
    const nextCurrency = normalizeCaptureCurrency(next);
    if (nextCurrency === captureCurrency) return;
    if (metaPatch && Object.keys(metaPatch).length) {
      setCurrencyMeta((prev) => ({ ...prev, ...metaPatch }));
    }
    setCaptureCurrency(nextCurrency);
    void saveSettingsPatchRemote(
      { activeCaptureCurrency: nextCurrency, exchangeMode: "manual" },
      { silent: true },
    ).catch(() => {});
  };

  const refreshCurrencyMeta = useCallback((fields, ctx) => {
    setCurrencyMeta((prev) => refreshRhCurrencyMeta(fields, prev, captureCurrency, ctx));
  }, [captureCurrency]);

  return {
    captureCurrency,
    setCaptureCurrency,
    switchCaptureCurrency,
    applyCaptureCurrency,
    alignLoadedFields,
    currencyMeta,
    currencyMetaSerialized: serializeCurrencyMeta(currencyMeta),
    moneda,
    appendMonedaPayload,
    resetMoneda,
    recordMoneyCapture,
    refreshCurrencyMeta,
  };
}
