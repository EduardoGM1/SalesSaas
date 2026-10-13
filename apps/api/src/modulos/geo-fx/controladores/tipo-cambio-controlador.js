/**
 * Tipo de cambio USD → moneda destino (proveedor externo).
 */
import { obtenerTipoCambioUsd } from "../servicios/tipo-cambio-servicio.js";

export async function obtenerTipoCambio(to) {
  return obtenerTipoCambioUsd(to);
}
