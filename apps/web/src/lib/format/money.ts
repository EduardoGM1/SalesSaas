import { useDbStore } from "@/stores/db-store";

export type MoneySettings = {
  currency?: "USD" | "MXN" | "CAD" | "EUR";
  exchangeRate?: number;
  language?: "es" | "en";
};

function displayLocale(lang?: string): string {
  return lang === "en" ? "en-US" : "es-MX";
}

export function resolveMoneySettings(override?: MoneySettings): Required<MoneySettings> {
  if (override) {
    const currency = override.currency ?? "USD";
    return {
      currency,
      exchangeRate: currency === "USD" ? 1 : Number(override.exchangeRate || 1),
      language: override.language ?? "es",
    };
  }
  const s = useDbStore.getState().db.settings;
  const currency = s?.currency ?? "USD";
  return {
    currency,
    exchangeRate: currency === "USD" ? 1 : Number(s?.exchangeRate || 1),
    language: s?.language ?? "es",
  };
}

export function toDisplayAmount(usdAmount: number, settings?: MoneySettings): number {
  const cfg = resolveMoneySettings(settings);
  if (cfg.currency === "USD") return usdAmount;
  return usdAmount * cfg.exchangeRate;
}

export function fmtN(n: number, settings?: MoneySettings): string {
  const cfg = resolveMoneySettings(settings);
  const amount = toDisplayAmount(n, cfg);
  return isNaN(amount)
    ? "0"
    : Number(amount).toLocaleString(displayLocale(cfg.language), {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
}

export function fmtN2(n: number, settings?: MoneySettings): string {
  const cfg = resolveMoneySettings(settings);
  const amount = toDisplayAmount(n, cfg);
  return isNaN(amount)
    ? "0.00"
    : Number(amount).toLocaleString(displayLocale(cfg.language), {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}

export function fmt(n: number, settings?: MoneySettings): string {
  const cfg = resolveMoneySettings(settings);
  const amount = toDisplayAmount(n, cfg);
  if (isNaN(amount)) {
    return new Intl.NumberFormat(displayLocale(cfg.language), {
      style: "currency",
      currency: cfg.currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(0);
  }
  return new Intl.NumberFormat(displayLocale(cfg.language), {
    style: "currency",
    currency: cfg.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function fmtD(n: number, settings?: MoneySettings): string {
  const cfg = resolveMoneySettings(settings);
  const amount = toDisplayAmount(n, cfg);
  if (isNaN(amount)) return "0";
  const v = Number(amount);
  return v.toLocaleString(displayLocale(cfg.language), {
    minimumFractionDigits: Number.isInteger(v) ? 0 : 1,
    maximumFractionDigits: 2,
  });
}

export function parseMoney(v: string | number | undefined): number {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

export function formatMoneyValue(v: string | number | undefined, settings?: MoneySettings): string {
  const raw = String(v ?? "").replace(/[^0-9.\-]/g, "");
  if (raw === "" || raw === "-" || raw === ".") return "";
  const n = parseFloat(raw);
  return isNaN(n) ? "" : fmtN(n, settings);
}

export function onlyDigits(v: string | number | undefined): string {
  return String(v ?? "").replace(/[^0-9]/g, "");
}
