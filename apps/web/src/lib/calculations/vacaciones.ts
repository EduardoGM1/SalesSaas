import { parseMoney } from "@/lib/format/money";

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

export function computeVacaciones(input: VacCalcInput): VacCalcResult {
  const viajes = parseMoney(input.vv);
  const costo = parseMoney(input.vc);
  const anios = parseMoney(input.va);
  const inf = parseMoney(input.vi) / 100;
  const ga = viajes * costo;
  const futAno = new Date().getFullYear() + anios;
  const cf = ga * Math.pow(1 + inf, anios);
  const ts = ga * anios;
  const tc = inf === 0 ? ts : ga * ((Math.pow(1 + inf, anios) - 1) / inf);
  return { viajes, costo, anios, inf, ga, futAno, cf, ts, tc };
}
