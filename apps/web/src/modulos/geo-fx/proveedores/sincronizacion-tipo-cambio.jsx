import { useEffect, useRef } from "react";
import { useAppStore } from "@/stores/app-store";
import { useDbStore } from "@/stores/db-store";
import { shallow } from "zustand/shallow";
import { refrescarTipoCambioAutomatico } from "@/modulos/geo-fx/api/sincronizar-tipo-cambio.js";

/** Mantiene el tipo de cambio actualizado en toda la app cuando el modo es automático. */
export function SincronizacionTipoCambio() {
  const hydrated = useAppStore((s) => s.hydrated);
  const settings = useDbStore((s) => s.db.settings, shallow);
  const currency = settings?.currency ?? "USD";
  const mode = settings?.exchangeMode ?? "auto";
  const inflight = useRef(false);

  useEffect(() => {
    if (!hydrated || mode !== "auto") return;
    if (inflight.current) return;
    inflight.current = true;
    refrescarTipoCambioAutomatico(currency).finally(() => {
      inflight.current = false;
    });
  }, [hydrated, mode, currency]);

  return null;
}

/** @deprecated Usar SincronizacionTipoCambio */
export const ExchangeRateSync = SincronizacionTipoCambio;
