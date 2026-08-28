import { WS_DEFAULTS } from "@/lib/constants";
import { ensureWSConfig } from "@/lib/calculations/worksheet";
import {
  lookupFinanciamientoPlazo,
  plazosUnicosFinanciamiento,
} from "@/lib/calculations/royal-holiday.js";

export interface MoneyBoxTerm {
  months: number;
  annualRate: number;
  label: string;
  desc: string;
  /** Id estable para marcar plan de origen en matriz. */
  id?: string;
  /**
   * Lookup de catálogo RH: factor_mensual para un % de enganche (0–1).
   * `null` = combinación N/A (no inventar ni caer a worksheetConfig).
   */
  resolveFactorMensual?: (downPct: number) => number | null;
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

export function termId(term: MoneyBoxTerm): string {
  return term.id || `T_${term.months}_${term.annualRate}`;
}

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
      id: `wo${i}_${months}_${annualRate}`,
    };
  });
}

function usesCatalogFactor(term: MoneyBoxTerm): boolean {
  return typeof term.resolveFactorMensual === "function";
}

/** Plazos y factores del Catálogo RH (Financiamiento), no de settings.worksheetConfig. */
export function termsFromRhFinanciamiento(
  financiamientoRows: unknown[] | null | undefined,
  nacionalidad: string | null | undefined,
): MoneyBoxTerm[] {
  const nat = nacionalidad || "mexicano";
  const rows = (financiamientoRows || []) as Array<{
    factor_mensual?: number;
    plazo_meses?: number;
    nacionalidad?: string;
    enganche_pct?: number;
  }>;
  return plazosUnicosFinanciamiento(rows, { nacionalidad: nat }).map((months) => ({
    months,
    annualRate: 0,
    label: `${months} meses`,
    desc: "",
    id: `rh_${months}`,
    resolveFactorMensual: (downPct: number) => {
      const row = lookupFinanciamientoPlazo(rows, {
        enganchePct: downPct * 100,
        nacionalidad: nat,
        plazoMeses: months,
      });
      if (!row) return null;
      const factor = Number(row.factor_mensual);
      return Number.isFinite(factor) && factor > 0 ? factor : null;
    },
  }));
}

/**
 * Factor de pago (mensualidad = financiado * factor).
 * Equivale a 1/annuityFactor del prototipo HTML.
 */
export function factorFor(months: number, annualRate: number): number {
  const r = annualRate / 100 / 12;
  if (months <= 0) return 0;
  if (r === 0) return 1 / months;
  return r / (1 - Math.pow(1 + r, -months));
}

/** Factor mensual del plazo: catálogo RH (si hay lookup) o PMT de worksheetConfig. */
export function factorForTerm(term: MoneyBoxTerm, downPct?: number): number | null {
  if (usesCatalogFactor(term)) {
    const factor = term.resolveFactorMensual?.(downPct ?? 0);
    if (factor == null || !Number.isFinite(Number(factor)) || Number(factor) <= 0) return null;
    return Number(factor);
  }
  const factor = factorFor(term.months, term.annualRate);
  return factor > 0 ? factor : null;
}

function cargoFinanciablePara(term: MoneyBoxTerm, cargoFinanciableCents: number): number {
  return usesCatalogFactor(term) ? 0 : cargoFinanciableCents;
}

/** Factor de anualidad (PV) — mismo que el HTML; financed / annuity = mensualidad. */
export function annuityFactor(term: MoneyBoxTerm, downPct?: number): number {
  const f = factorForTerm(term, downPct);
  return f != null && f > 0 ? 1 / f : 0;
}

export function toCents(value: number | string): number {
  const n = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function fromCents(cents: number): number {
  return (Number(cents) || 0) / 100;
}

export function roundSaleDown(cents: number, stepCents: number): number {
  const step = Math.max(1, Math.round(stepCents));
  return Math.floor(cents / step) * step;
}

export type MoneyBoxPolicyConfig = {
  minDownPct: number;
  maxDownPct: number;
  fcCents: number;
  ffCents: number;
  maxSaleCents: number;
  roundStepCents: number;
  pctStep: number;
  minDrop: number;
};

export type PlanMatrixRow = MoneyBoxTerm & {
  id: string;
  monthlyCents: number;
  /** false si el catálogo RH no tiene esa combinación enganche × plazo × nacionalidad. */
  available: boolean;
  feasible: boolean;
  reason: string;
  origin: boolean;
  best: boolean;
};

export type MoneyBoxProposal = {
  saleCents: number;
  downCents: number;
  downPct: number;
  totalTodayCents: number;
  originPlanId: string | null;
  plans: PlanMatrixRow[];
};

export type ProposalCandidate = {
  saleCents: number;
  downCents: number;
  downPct: number;
  totalTodayCents: number;
  originPlanId: string | null;
};

export function mensualidadPara(
  ventaCents: number,
  engancheCents: number,
  cargoFinanciableCents: number,
  term: MoneyBoxTerm,
): number | null {
  const downPct = ventaCents > 0 ? engancheCents / ventaCents : 0;
  const factor = factorForTerm(term, downPct);
  if (factor == null) return null;
  const financed = Math.max(
    0,
    ventaCents - engancheCents + cargoFinanciablePara(term, cargoFinanciableCents),
  );
  return Math.round(financed * factor);
}

export function reasonText({
  downPctOk,
  monthlyOk,
  cashOk,
}: {
  downPctOk: boolean;
  monthlyOk: boolean;
  cashOk: boolean;
}): string {
  const reasons: string[] = [];
  if (!downPctOk) reasons.push("enganche fuera del rango");
  // "supera la mensualidad" se omite a propósito: el rojo de la celda ya lo comunica.
  void monthlyOk;
  if (!cashOk) reasons.push("requiere más efectivo hoy");
  return reasons.length ? reasons.join(" · ") : "";
}

export function buildPlanMatrix({
  saleCents,
  downCents,
  originPlanId,
  monthlyCapCents,
  cashCapCents,
  config,
  terms,
}: {
  saleCents: number;
  downCents: number;
  originPlanId: string | null;
  monthlyCapCents: number;
  cashCapCents: number;
  config: MoneyBoxPolicyConfig;
  terms: MoneyBoxTerm[];
}): PlanMatrixRow[] {
  const downPct = saleCents > 0 ? downCents / saleCents : 0;
  const downPctOk =
    downPct >= config.minDownPct - 0.000001 && downPct <= config.maxDownPct + 0.000001;
  const totalTodayCents = downCents + config.fcCents;

  const rows = terms.map((term) => {
    const id = termId(term);
    const monthlyOrNull = mensualidadPara(saleCents, downCents, config.ffCents, term);
    const available = monthlyOrNull != null;
    const monthlyCents = monthlyOrNull ?? 0;
    const monthlyOk = available && (monthlyCapCents <= 0 || monthlyCents <= monthlyCapCents);
    const cashOk = cashCapCents <= 0 || totalTodayCents <= cashCapCents;
    return {
      ...term,
      id,
      monthlyCents,
      available,
      feasible: available && downPctOk && monthlyOk && cashOk,
      reason: available ? reasonText({ downPctOk, monthlyOk, cashOk }) : "N/A",
      origin: available && id === originPlanId,
      best: false,
    };
  });
  const feasible = rows.filter((r) => r.feasible);
  if (feasible.length) {
    const bestId = feasible.reduce((a, b) => (a.monthlyCents <= b.monthlyCents ? a : b)).id;
    for (const row of rows) {
      row.best = row.id === bestId;
    }
  }
  return rows;
}

export function uniqueBySale(candidates: ProposalCandidate[]): ProposalCandidate[] {
  const map = new Map<string, ProposalCandidate>();
  for (const candidate of candidates) {
    const key = String(candidate.saleCents);
    const previous = map.get(key);
    if (!previous || candidate.downCents < previous.downCents) map.set(key, candidate);
  }
  return [...map.values()].sort((a, b) => b.saleCents - a.saleCents);
}

const TARGET_SETS = [
  [0.0, 0.42, 0.82],
  [0.08, 0.52, 0.95],
  [0.16, 0.62, 1.0],
  [0.0, 0.6, 1.0],
];

/** Heurística del prototipo HTML — portada tal cual. */
export function selectThree(
  candidates: ProposalCandidate[],
  refreshIndex: number,
  minDrop: number,
): ProposalCandidate[] {
  const sorted = uniqueBySale(candidates);
  if (!sorted.length) return [];

  const targets = TARGET_SETS[refreshIndex % TARGET_SETS.length];
  const selected: ProposalCandidate[] = [];

  for (const target of targets) {
    let index = Math.round(target * (sorted.length - 1));
    let candidate = sorted[index];

    if (selected.length) {
      const maxAllowed = selected[selected.length - 1].saleCents * (1 - minDrop);
      while (index < sorted.length && candidate.saleCents > maxAllowed) {
        index += 1;
        candidate = sorted[Math.min(index, sorted.length - 1)];
      }
    }

    if (!selected.some((item) => item.saleCents === candidate.saleCents)) {
      selected.push(candidate);
    }
  }

  for (const candidate of sorted) {
    if (selected.length >= 3) break;
    if (!selected.some((item) => item.saleCents === candidate.saleCents)) {
      selected.push(candidate);
    }
  }

  return selected.slice(0, 3);
}

function attachMatrix(
  proposals: ProposalCandidate[],
  {
    monthlyCapCents,
    cashCapCents,
    config,
    terms,
  }: {
    monthlyCapCents: number;
    cashCapCents: number;
    config: MoneyBoxPolicyConfig;
    terms: MoneyBoxTerm[];
  },
): MoneyBoxProposal[] {
  return proposals.map((proposal) => ({
    ...proposal,
    plans: buildPlanMatrix({
      saleCents: proposal.saleCents,
      downCents: proposal.downCents,
      originPlanId: proposal.originPlanId,
      monthlyCapCents,
      cashCapCents,
      config,
      terms,
    }),
  }));
}

export function generateDownProposals(
  cashCents: number,
  monthlyCapCents: number,
  config: MoneyBoxPolicyConfig,
  terms: MoneyBoxTerm[],
  refreshIndex: number,
): MoneyBoxProposal[] {
  const usableDownCents = Math.max(0, cashCents - config.fcCents);
  if (usableDownCents <= 0) return [];

  const candidates: ProposalCandidate[] = [];
  for (let pct = config.minDownPct; pct <= config.maxDownPct + 0.000001; pct += config.pctStep) {
    const rawSale = usableDownCents / pct;
    const saleCents = roundSaleDown(Math.min(rawSale, config.maxSaleCents), config.roundStepCents);
    if (saleCents <= 0 || saleCents < usableDownCents) continue;

    const actualPct = usableDownCents / saleCents;
    if (actualPct < config.minDownPct - 0.000001 || actualPct > config.maxDownPct + 0.000001) {
      continue;
    }

    candidates.push({
      saleCents,
      downCents: usableDownCents,
      downPct: actualPct,
      totalTodayCents: usableDownCents + config.fcCents,
      originPlanId: null,
    });
  }

  return attachMatrix(selectThree(candidates, refreshIndex, config.minDrop), {
    monthlyCapCents,
    cashCapCents: cashCents,
    config,
    terms,
  });
}

export function generateMonthlyProposals(
  monthlyCapCents: number,
  cashCapCents: number,
  config: MoneyBoxPolicyConfig,
  terms: MoneyBoxTerm[],
  refreshIndex: number,
): MoneyBoxProposal[] {
  if (monthlyCapCents <= 0) return [];
  const candidates: ProposalCandidate[] = [];

  for (const term of terms) {
    for (let pct = config.minDownPct; pct <= config.maxDownPct + 0.000001; pct += config.pctStep) {
      const af = annuityFactor(term, pct);
      if (af <= 0) continue;
      const balanceCapacity = monthlyCapCents * af;
      const financedShare = 1 - pct;
      if (financedShare <= 0) continue;

      const extraFf = cargoFinanciablePara(term, config.ffCents);
      const rawSale = (balanceCapacity - extraFf) / financedShare;
      const saleCents = roundSaleDown(Math.min(rawSale, config.maxSaleCents), config.roundStepCents);
      if (saleCents <= 0) continue;

      const downByPct = Math.ceil(saleCents * pct);
      const downByMonthly = Math.ceil(saleCents + extraFf - balanceCapacity);
      const downByPolicy = Math.ceil(saleCents * config.minDownPct);
      const downCents = Math.max(0, downByPct, downByMonthly, downByPolicy);
      const actualPct = downCents / saleCents;

      if (actualPct < config.minDownPct - 0.000001 || actualPct > config.maxDownPct + 0.000001) {
        continue;
      }

      candidates.push({
        saleCents,
        downCents,
        downPct: actualPct,
        totalTodayCents: downCents + config.fcCents,
        originPlanId: termId(term),
      });
    }
  }

  return attachMatrix(selectThree(candidates, refreshIndex, config.minDrop), {
    monthlyCapCents,
    cashCapCents,
    config,
    terms,
  });
}

export function generateCombinedProposals(
  cashCents: number,
  monthlyCapCents: number,
  config: MoneyBoxPolicyConfig,
  terms: MoneyBoxTerm[],
  refreshIndex: number,
): MoneyBoxProposal[] {
  const usableCashCents = Math.max(0, cashCents - config.fcCents);
  if (usableCashCents <= 0 || monthlyCapCents <= 0) return [];

  const candidates: ProposalCandidate[] = [];

  for (const term of terms) {
    for (let pct = config.minDownPct; pct <= config.maxDownPct + 0.000001; pct += config.pctStep) {
      const af = annuityFactor(term, pct);
      if (af <= 0) continue;
      const balanceCapacity = monthlyCapCents * af;
      const financedShare = 1 - pct;
      if (financedShare <= 0) continue;

      const extraFf = cargoFinanciablePara(term, config.ffCents);
      const saleByCash = usableCashCents / pct;
      const saleByMonthly = (balanceCapacity - extraFf) / financedShare;
      const rawSale = Math.min(saleByCash, saleByMonthly, config.maxSaleCents);
      const saleCents = roundSaleDown(rawSale, config.roundStepCents);
      if (saleCents <= 0) continue;

      const downBySelectedPct = Math.ceil(saleCents * pct);
      const downByPolicy = Math.ceil(saleCents * config.minDownPct);
      const downByMonthly = Math.ceil(saleCents + extraFf - balanceCapacity);
      const downCents = Math.max(0, downBySelectedPct, downByPolicy, downByMonthly);
      const actualPct = downCents / saleCents;
      const totalTodayCents = downCents + config.fcCents;
      const originMonthly = mensualidadPara(saleCents, downCents, config.ffCents, term);

      if (actualPct < config.minDownPct - 0.000001 || actualPct > config.maxDownPct + 0.000001) {
        continue;
      }
      if (totalTodayCents > cashCents) continue;
      if (originMonthly == null || originMonthly > monthlyCapCents) continue;

      candidates.push({
        saleCents,
        downCents,
        downPct: actualPct,
        totalTodayCents,
        originPlanId: termId(term),
      });
    }
  }

  return attachMatrix(selectThree(candidates, refreshIndex, config.minDrop), {
    monthlyCapCents,
    cashCapCents: cashCents,
    config,
    terms,
  });
}

/**
 * Compat: opción por plazo con enganche fijo (API previa).
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
 * Compat: cada opción usa el factor de SU plazo (API previa).
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

export function defaultPolicyConfig(partial: Partial<MoneyBoxPolicyConfig> = {}): MoneyBoxPolicyConfig {
  return {
    minDownPct: 0.3,
    maxDownPct: 0.5,
    fcCents: 0,
    ffCents: 0,
    maxSaleCents: 15_000_000,
    roundStepCents: 1,
    pctStep: 0.01,
    minDrop: 0.1,
    ...partial,
  };
}
