import { useEffect, useRef } from "react";
import { useAppStore } from "@/stores/app-store";
import { useDbStore } from "@/stores/db-store";
import { refreshAutoExchangeRate } from "@/lib/exchange-rate-sync.js";

/** Mantiene el tipo de cambio actualizado en toda la app cuando el modo es automático. */
export function ExchangeRateSync() {
  const hydrated = useAppStore((s) => s.hydrated);
  const currency = useDbStore((s) => s.db.settings?.currency ?? "USD");
  const mode = useDbStore((s) => s.db.settings?.exchangeMode ?? "auto");
  const inflight = useRef(false);

  useEffect(() => {
    if (!hydrated || mode !== "auto") return;
    if (inflight.current) return;
    inflight.current = true;
    refreshAutoExchangeRate(currency).finally(() => {
      inflight.current = false;
    });
  }, [hydrated, mode, currency]);

  return null;
}
