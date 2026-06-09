const SUPPORTED = new Set(["USD", "MXN", "CAD", "EUR"]);
const CACHE_MS = 12 * 60 * 60 * 1000;
const API_BASE = process.env.FRANKFURTER_API_URL ?? "https://api.frankfurter.dev/v1";

/** @type {Map<string, { rate: number, date: string, source: string, fetchedAt: number }>} */
const cache = new Map();

export function isSupportedCurrency(code) {
  return SUPPORTED.has(String(code || "").toUpperCase());
}

/**
 * Tipo de cambio: 1 USD = rate unidades de `to`.
 * Fuente: Frankfurter (tasas de referencia de bancos centrales).
 */
export async function getUsdExchangeRate(to) {
  const currency = String(to || "").toUpperCase();
  if (!SUPPORTED.has(currency)) {
    throw new Error(`Moneda no soportada: ${currency}. Usa: ${[...SUPPORTED].join(", ")}.`);
  }
  if (currency === "USD") {
    const today = new Date().toISOString().slice(0, 10);
    return { base: "USD", to: "USD", rate: 1, date: today, source: "fixed" };
  }

  const cached = cache.get(currency);
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) {
    return { base: "USD", to: currency, rate: cached.rate, date: cached.date, source: cached.source };
  }

  const url = `${API_BASE}/latest?base=USD&symbols=${encodeURIComponent(currency)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("No se pudo obtener el tipo de cambio. Intenta más tarde.");
  }
  const body = await res.json();
  const rate = Number(body?.rates?.[currency]);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Respuesta de tipo de cambio inválida.");
  }

  const entry = {
    rate,
    date: String(body.date ?? new Date().toISOString().slice(0, 10)),
    source: "frankfurter",
    fetchedAt: Date.now(),
  };
  cache.set(currency, entry);

  return { base: "USD", to: currency, rate: entry.rate, date: entry.date, source: entry.source };
}
