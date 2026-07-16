import { WS_DEFAULTS } from "@/lib/constants";
import { ensureWSConfig } from "@/lib/calculations/worksheet";

export const MONEY_BOX_MULTIPLIERS = [0.85, 1, 1.15] as const;

export interface MoneyBoxTerm {
  months: number;
  annualRate: number;
  label: string;
  desc: string;
}

export interface MoneyBoxScenario {
  sale: number;
  downPayment: number;
}

const GENERIC_DESCS = [
  "Mensualidad rápida con menor plazo.",
  "Punto medio entre plazo y pago.",
  "Mensualidad estándar para venta financiada.",
];

/** Plazos desde la misma config Worksheet del usuario (wo1m/wo1r…). */
export function termsFromWorksheetConfig(
  worksheetConfig: Record<string, string | number> | null | undefined,
  descLabels: string[] = GENERIC_DESCS,
): MoneyBoxTerm[] {
  const cfg = ensureWSConfig({ ...(worksheetConfig || {}) });
  return [1, 2, 3].map((i) => {
    const months =
      parseFloat(String(cfg[`wo${i}m`] ?? WS_DEFAULTS[`wo${i}m`]).replace(/,/g, "")) || 0;
    const annualRate =
      parseFloat(String(cfg[`wo${i}r`] ?? WS_DEFAULTS[`wo${i}r`]).replace(/,/g, "")) || 0;
    return {
      months,
      annualRate,
      label: `${months} meses / ${annualRate}%`,
      desc: descLabels[i - 1] || GENERIC_DESCS[i - 1] || "",
    };
  });
}

export function factorFor(months: number, annualRate: number): number {
  const r = annualRate / 100 / 12;
  if (months <= 0) return 0;
  if (r === 0) return 1 / months;
  return r / (1 - Math.pow(1 + r, -months));
}

export function generateByDownPayment(
  input: number,
  dpPercent: number,
  multipliers: readonly number[] = MONEY_BOX_MULTIPLIERS,
): MoneyBoxScenario[] {
  if (dpPercent <= 0) return multipliers.map(() => ({ sale: 0, downPayment: 0 }));
  const baseSale = input / dpPercent;
  return multipliers.map((m) => {
    const sale = baseSale * m;
    return { sale, downPayment: sale * dpPercent };
  });
}

export function generateByMonthly(
  input: number,
  dpPercent: number,
  financePercent: number,
  monthlyTerms: MoneyBoxTerm[],
  multipliers: readonly number[] = MONEY_BOX_MULTIPLIERS,
): MoneyBoxScenario[] {
  if (!monthlyTerms.length || financePercent <= 0) {
    return multipliers.map(() => ({ sale: 0, downPayment: 0 }));
  }
  const baseTerm = monthlyTerms[monthlyTerms.length - 1];
  const factor = factorFor(baseTerm.months, baseTerm.annualRate);
  if (factor <= 0) return multipliers.map(() => ({ sale: 0, downPayment: 0 }));
  const baseBalance = input / factor;
  const baseSale = baseBalance / financePercent;
  return multipliers.map((m) => {
    const sale = baseSale * m;
    return { sale, downPayment: sale * dpPercent };
  });
}

export function monthlyPaymentsForScenarios(
  results: MoneyBoxScenario[],
  financePercent: number,
  term: MoneyBoxTerm,
): number[] {
  const factor = factorFor(term.months, term.annualRate);
  return results.map((x) => x.sale * financePercent * factor);
}
