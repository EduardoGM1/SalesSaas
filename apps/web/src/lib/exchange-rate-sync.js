import { useDbStore } from "@/stores/db-store";

export async function fetchExchangeRate(currency) {
  if (!currency || currency === "USD") {
    return { rate: 1, date: null };
  }
  const res = await fetch(`/api/v1/exchange-rates?to=${encodeURIComponent(currency)}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "No se pudo obtener el tipo de cambio.");
  const rate = Number(body.data?.rate);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Tipo de cambio inválido.");
  return { rate, date: body.data?.date ?? null };
}

/** Actualiza exchangeRate en el store cuando el modo es automático. */
export async function refreshAutoExchangeRate(currency = "USD") {
  const db = useDbStore.getState().db;
  const mode = db.settings?.exchangeMode ?? "auto";
  if (mode !== "auto") return { ok: true, skipped: true };

  try {
    const { rate } = await fetchExchangeRate(currency);
    const current = useDbStore.getState().db;
    useDbStore.getState().replaceDb({
      ...current,
      settings: { ...current.settings, exchangeRate: rate },
    });
    return { ok: true, rate };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
