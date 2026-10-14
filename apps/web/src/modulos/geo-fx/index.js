/**
 * Fachada pública — geo-fx (web).
 * Otros módulos / UI legacy solo importan desde aquí.
 */
export {
  obtenerTipoCambioRemoto,
  fetchExchangeRate,
  refrescarTipoCambioAutomatico,
  refreshAutoExchangeRate,
} from "./api/sincronizar-tipo-cambio.js";

export {
  SincronizacionTipoCambio,
  ExchangeRateSync,
} from "./proveedores/sincronizacion-tipo-cambio.jsx";
