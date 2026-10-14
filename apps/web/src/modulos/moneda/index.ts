/**
 * Fachada pública — moneda.
 * Otros módulos / UI legacy solo importan desde aquí.
 */
export type { CaptureCurrency, MonedaCode, MonedaContext, MonedaSettingsLike } from "./servicios/moneda-servicio";
export {
  CAPTURE_CURRENCIES,
  convertir,
  getMonedaContext,
  isUnusualUsdToMxnRate,
  normalizeUsdToMxnRate,
  resolveUsdToMxnRate,
  resolveUsdToMxnRateFromAmounts,
  unusualUsdToMxnRateMessage,
  buildAmountRecord,
  resolveOperationalAmount,
  parseCurrencyMeta,
  serializeCurrencyMeta,
  normalizeCaptureCurrency,
  formatCaptureMoneyValue,
  fmtWithCurrencyCode,
  SURVEY_MONEY_FIELDS,
  VACACIONES_MONEY_FIELDS,
  WORKSHEET_MONEY_FIELDS,
  RH_WORKSHEET_MONEY_FIELDS,
  buildOperationalFields,
  convertCaptureMoneyFields,
  type AmountRecord,
  type CurrencyMetaMap,
} from "./servicios/moneda-servicio";

export {
  switchRhFormCaptureCurrency,
  rhMontoVentaOperational,
  rhFormToOperational,
  rhMontoVentaCapture,
  refreshRhCurrencyMeta,
} from "./captura/rh-formulario-moneda.js";
