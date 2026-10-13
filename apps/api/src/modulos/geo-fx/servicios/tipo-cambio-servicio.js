/**
 * Servicio de tipo de cambio: I/O al proveedor + caché en memoria.
 */
import {
  CACHE_MS,
  armarResultadoUsdFijo,
  escribirCache,
  esMonedaSoportada,
  interpretarRespuestaProveedor,
  leerCache,
  MONEDAS_SOPORTADAS,
} from "../dominio/tipo-cambio-nucleo.js";

const API_BASE = process.env.FRANKFURTER_API_URL ?? "https://api.frankfurter.dev/v1";

/** @type {Map<string, { rate: number, date: string, source: string, fetchedAt: number }>} */
const cache = new Map();

export { esMonedaSoportada, CACHE_MS };

/**
 * Tipo de cambio: 1 USD = rate unidades de `to`.
 * Fuente: Frankfurter (tasas de referencia de bancos centrales).
 */
export async function obtenerTipoCambioUsd(to) {
  const currency = String(to || "").toUpperCase();
  if (!esMonedaSoportada(currency)) {
    throw new Error(`Moneda no soportada: ${currency}. Usa: ${[...MONEDAS_SOPORTADAS].join(", ")}.`);
  }
  if (currency === "USD") {
    return armarResultadoUsdFijo();
  }

  const hit = leerCache(cache, currency);
  if (hit) return hit;

  const url = `${API_BASE}/latest?base=USD&symbols=${encodeURIComponent(currency)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("No se pudo obtener el tipo de cambio. Intenta más tarde.");
  }
  const body = await res.json();
  const entry = interpretarRespuestaProveedor(body, currency);
  escribirCache(cache, currency, entry);

  return { base: "USD", to: currency, rate: entry.rate, date: entry.date, source: entry.source };
}
