import { useDbStore } from "@/stores/db-store";

/** Obtiene 1 USD → `currency` desde el contrato GET /api/v1/exchange-rates. */
export async function obtenerTipoCambioRemoto(currency) {
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

/** @deprecated Usar obtenerTipoCambioRemoto — alias de contrato interno previo. */
export const fetchExchangeRate = obtenerTipoCambioRemoto;

/** Actualiza exchangeRate en el store cuando el modo es automático. */
export async function refrescarTipoCambioAutomatico(currency = "USD") {
  const db = useDbStore.getState().db;
  const mode = db.settings?.exchangeMode ?? "auto";
  if (mode !== "auto") return { ok: true, skipped: true };

  try {
    const { rate } = await obtenerTipoCambioRemoto(currency);
    const current = useDbStore.getState().db;
    const prevRate = Number(current.settings?.exchangeRate);
    if (Number.isFinite(prevRate) && prevRate === rate) {
      return { ok: true, rate, skipped: true };
    }
    useDbStore.getState().replaceDb({
      ...current,
      settings: { ...current.settings, exchangeRate: rate },
    });
    return { ok: true, rate };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** @deprecated Usar refrescarTipoCambioAutomatico */
export const refreshAutoExchangeRate = refrescarTipoCambioAutomatico;
