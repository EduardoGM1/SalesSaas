import { useMemo } from "react";
import { useDbStore } from "@/stores/db-store";
import { fmt, fmtD, fmtN, fmtN2 } from "@/lib/format/money";

function buildMoneySettings(settings) {
  const currency = settings?.currency ?? "USD";
  return {
    currency,
    exchangeRate: currency === "USD" ? 1 : Number(settings?.exchangeRate || 1),
    language: settings?.language ?? "es",
  };
}

export function useMoney() {
  const settings = useDbStore((s) => s.db.settings);
  const cfg = useMemo(() => buildMoneySettings(settings), [
    settings?.currency,
    settings?.exchangeRate,
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
