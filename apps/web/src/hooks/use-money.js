import { useMemo } from "react";
import { useDbStore } from "@/stores/db-store";
import { shallow } from "zustand/shallow";
import { fmt, fmtD, fmtN, fmtN2 } from "@/lib/format/money";

function buildMoneySettings(settings) {
  // Preferir moneda de captura global (SelectorMoneda); fallback a moneda visual.
  const currency = settings?.activeCaptureCurrency === "MXN" || settings?.currency === "MXN"
    ? "MXN"
    : "USD";
  const exchangeRate = currency === "USD"
    ? 1
    : Number(settings?.usdToMxnRate || settings?.exchangeRate || 1);
  return {
    currency,
    exchangeRate,
    exchangeMode: settings?.exchangeMode ?? "auto",
    language: settings?.language ?? "es",
  };
}

export function useMoney() {
  const settings = useDbStore((s) => s.db.settings, shallow);
  const cfg = useMemo(() => buildMoneySettings(settings), [
    settings?.activeCaptureCurrency,
    settings?.currency,
    settings?.usdToMxnRate,
    settings?.exchangeRate,
    settings?.exchangeMode,
    settings?.language,
  ]);

  return useMemo(() => ({
    settings: cfg,
    fmt: (n) => fmt(n, cfg),
    fmtN: (n) => fmtN(n, cfg),
    fmtN2: (n) => fmtN2(n, cfg),
    fmtD: (n) => fmtD(n, cfg),
  }), [cfg]);
}
