import { WS_DEFAULTS } from "@/lib/constants";
import { ensureWSConfig } from "@/lib/calculations/worksheet";

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

/** Redondeo a 2 decimales — solo para mostrar, nunca en pasos intermedios. */
export const round2 = (value: number) => Math.round(value * 100) / 100;

export type MensualidadInput = {
  mensualidadPerfecta: number;
  factorFinanciero: number;
  porcentajeEnganche: number;
  porcentajeFinanciado: number;
};

export type EngancheInput = {
  engancheDisponible: number;
  factorFinanciero: number;
  porcentajeEnganche: number;
  porcentajeFinanciado: number;
};

export function calcularVentaPorMensualidadPerfecta(input: MensualidadInput) {
  const { mensualidadPerfecta, factorFinanciero, porcentajeEnganche, porcentajeFinanciado } = input;
  const balanceFinanciado = mensualidadPerfecta / factorFinanciero;
  const ventaTotal = balanceFinanciado / porcentajeFinanciado;
  const enganche = ventaTotal * porcentajeEnganche;
  return {
    ventaTotal,
    enganche,
    balanceFinanciado,
    mensualidad: mensualidadPerfecta,
    display: {
      ventaTotal: round2(ventaTotal),
      enganche: round2(enganche),
      balanceFinanciado: round2(balanceFinanciado),
      mensualidad: round2(mensualidadPerfecta),
    },
  };
}

export function calcularVentaPorEnganchePerfecto(input: EngancheInput) {
  const { engancheDisponible, factorFinanciero, porcentajeEnganche, porcentajeFinanciado } = input;
  const ventaTotal = engancheDisponible / porcentajeEnganche;
  const balanceFinanciado = ventaTotal * porcentajeFinanciado;
  const mensualidad = balanceFinanciado * factorFinanciero;
  return {
    ventaTotal,
    enganche: engancheDisponible,
    balanceFinanciado,
    mensualidad,
    display: {
      ventaTotal: round2(ventaTotal),
      enganche: round2(engancheDisponible),
      balanceFinanciado: round2(balanceFinanciado),
      mensualidad: round2(mensualidad),
    },
  };
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

/**
 * Opción por plazo: venta/enganche idénticos (no dependen del factor);
 * la mensualidad por fila usa el factor de cada plazo.
 */
export function generateByDownPayment(
  input: number,
  dpPercent: number,
  financePercent: number,
  monthlyTerms: MoneyBoxTerm[],
): MoneyBoxScenario[] {
  if (!monthlyTerms.length || dpPercent <= 0 || financePercent <= 0) {
    return monthlyTerms.map(() => ({ sale: 0, downPayment: 0 }));
  }
  return monthlyTerms.map((term) => {
    const factor = factorFor(term.months, term.annualRate);
    if (factor <= 0) return { sale: 0, downPayment: 0 };
    const calc = calcularVentaPorEnganchePerfecto({
      engancheDisponible: input,
      factorFinanciero: factor,
      porcentajeEnganche: dpPercent,
      porcentajeFinanciado: financePercent,
    });
    return { sale: calc.ventaTotal, downPayment: calc.enganche };
  });
}

/**
 * Cada opción usa el factor financiero de SU propio plazo (Worksheet).
 * No reutiliza el de 12 meses ni multiplicadores artificiales.
 */
export function generateByMonthly(
  input: number,
  dpPercent: number,
  financePercent: number,
  monthlyTerms: MoneyBoxTerm[],
): MoneyBoxScenario[] {
  if (!monthlyTerms.length || financePercent <= 0 || dpPercent < 0) {
    return monthlyTerms.map(() => ({ sale: 0, downPayment: 0 }));
  }
  return monthlyTerms.map((term) => {
    const factor = factorFor(term.months, term.annualRate);
    if (factor <= 0) return { sale: 0, downPayment: 0 };
    const calc = calcularVentaPorMensualidadPerfecta({
      mensualidadPerfecta: input,
      factorFinanciero: factor,
      porcentajeEnganche: dpPercent,
      porcentajeFinanciado: financePercent,
    });
    return { sale: calc.ventaTotal, downPayment: calc.enganche };
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
