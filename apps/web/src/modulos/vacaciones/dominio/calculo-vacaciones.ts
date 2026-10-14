/**
 * Cálculos puros de la tool Vacaciones.
 * Contratos JSON (vv, vc, va, vi, capture_currency, …) y slug `vacaciones` no se renombran.
 */
import { parseMoney } from "@/lib/format/money";

/** Entrada: claves persistidas en tool_calculations.data */
export interface VacCalcInput {
  vv: string | number;
  vc: string | number;
  va: string | number;
  vi: string | number;
}

export interface VacCalcResult {
  viajes: number;
  costo: number;
  anios: number;
  inf: number;
  ga: number;
  futAno: number;
  cf: number;
  ts: number;
  tc: number;
}

export function calcularVacaciones(input: VacCalcInput): VacCalcResult {
  const viajes = parseMoney(input.vv);
  const costo = parseMoney(input.vc);
  const anios = parseMoney(input.va);
  const inf = parseMoney(input.vi) / 100;
  const ga = viajes * costo;
  const futAno = new Date().getFullYear() + anios;
  const cf = ga * Math.pow(1 + inf, anios);
  const ts = ga * anios;
  // Acumulado con inflación: Σ_{k=0..N-1} ga·(1+inf)^k (total de tarjetas).
  const tc = inf === 0 ? ts : ga * ((Math.pow(1 + inf, anios) - 1) / inf);
  return { viajes, costo, anios, inf, ga, futAno, cf, ts, tc };
}

export interface VacCumulativePoint {
  year: number;
  yearIndex: number;
  /** Acumulado sin inflación: ga × i */
  withoutInflation: number;
  /** Acumulado con inflación (misma serie que el total de tarjetas). */
  withInflation: number;
}

/**
 * Serie acumulada año a año (solo vista acumulada).
 * Sin inflación: ga × i. Con inflación: misma geometría que `tc` en el punto N.
 */
export function construirSerieAcumuladaVacaciones(
  input: VacCalcInput,
  startYear: number = new Date().getFullYear(),
): VacCumulativePoint[] {
  const { ga, anios, inf } = calcularVacaciones(input);
  const years = Math.max(0, Math.floor(anios));
  const points: VacCumulativePoint[] = [];

  for (let i = 0; i <= years; i++) {
    const withoutInflation = ga * i;
    let withInflation = withoutInflation;
    if (i > 0) {
      if (inf === 0) {
        withInflation = ga * i;
      } else {
        // Σ_{k=0}^{i-1} ga·(1+inf)^k
        withInflation = ga * ((Math.pow(1 + inf, i) - 1) / inf);
      }
    }
    points.push({
      year: startYear + i,
      yearIndex: i,
      withoutInflation,
      withInflation,
    });
  }

  return points;
}
