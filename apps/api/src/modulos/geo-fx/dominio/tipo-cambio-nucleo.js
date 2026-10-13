/** Dominio puro de tipo de cambio (sin I/O de red). */

export const MONEDAS_SOPORTADAS = new Set(["USD", "MXN", "CAD", "EUR"]);
export const CACHE_MS = 12 * 60 * 60 * 1000;

export function esMonedaSoportada(code) {
  return MONEDAS_SOPORTADAS.has(String(code || "").toUpperCase());
}

export function armarResultadoUsdFijo(fechaIso = new Date().toISOString().slice(0, 10)) {
  return { base: "USD", to: "USD", rate: 1, date: fechaIso, source: "fixed" };
}

/**
 * Interpreta el JSON del proveedor (Frankfurter u homólogo).
 * @returns {{ rate: number, date: string, source: string }}
 */
export function interpretarRespuestaProveedor(body, currency, source = "frankfurter") {
  const rate = Number(body?.rates?.[currency]);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Respuesta de tipo de cambio inválida.");
  }
  return {
    rate,
    date: String(body.date ?? new Date().toISOString().slice(0, 10)),
    source,
  };
}

export function leerCache(cache, currency, ahora = Date.now()) {
  const cached = cache.get(currency);
  if (cached && ahora - cached.fetchedAt < CACHE_MS) {
    return { base: "USD", to: currency, rate: cached.rate, date: cached.date, source: cached.source };
  }
  return null;
}

export function escribirCache(cache, currency, entry, ahora = Date.now()) {
  cache.set(currency, { ...entry, fetchedAt: ahora });
}
