/**
 * Tipo de cambio USD → moneda destino (proveedor externo).
 */
import { getUsdExchangeRate } from "../lib/exchange-rates.js";

export async function obtenerTipoCambio(to) {
  return getUsdExchangeRate(to);
}
