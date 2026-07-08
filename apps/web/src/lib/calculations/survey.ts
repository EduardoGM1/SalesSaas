import { fmt, fmtD, fmtN, parseMoney } from "@/lib/format/money";

export type SurveyData = Record<string, string | number | undefined>;

function numFromVal(v: string | number | undefined): number {
  return parseMoney(v);
}

export interface SurveyCalcResult {
  current: { vac: string; night: number; dp: number; mi: number };
  hist: { vac: number; night: number; dp: number; mi: number; nights: number; spend: number; avg: number };
  future: { vac: number; night: number; dp: number; mi: number; nights: number; spend: number };
  pattern: { vac: number; night: number; dp: number; mi: number };
  split: { hpct: number; hval: number; vval: number };
  trip: { dp: number; mi: number };
  sType: string;
}

export function computeSurvey(d: SurveyData, sType = "hotel"): SurveyCalcResult {
  const total = numFromVal(d.total);
  const hpct = (numFromVal(d.hpct) || 70) / 100;
  const base = sType === "paquete" ? total * hpct : total;
  const currentNights = numFromVal(d.nights) || 0;
  const currentMonthly = base / 12;

  const histRows = [1, 2, 3].map((i) => ({
    dest: String(d[`sh${i}c`] || "").trim(),
    year: numFromVal(d[`sh${i}y`]),
    nights: numFromVal(d[`sh${i}n`]),
    amt: numFromVal(d[`sh${i}a`]),
  }));
  const validHist = histRows.filter((r) => r.year > 0 && (r.amt > 0 || r.nights > 0 || r.dest));
  const histYears = Array.from(new Set(validHist.map((r) => r.year)));
  const histYearCount = histYears.length || 0;
  const histNights = histRows.reduce((a, r) => a + (r.nights > 0 ? r.nights : 0), 0);
  const histSpend = histRows.reduce((a, r) => a + (r.amt > 0 ? r.amt : 0), 0);
  const histCostRows = histRows.filter((r) => r.amt > 0);
  const histAvg = histCostRows.length ? histCostRows.reduce((a, r) => a + r.amt, 0) / histCostRows.length : 0;
  const histVacYear = histYearCount ? validHist.length / histYearCount : 0;
  const histNightYear = histYearCount ? validHist.reduce((a, r) => a + r.nights, 0) / histYearCount : 0;

  const futRows = [1, 2, 3].map((i) => ({
    dest: String(d[`sf${i}c`] || "").trim(),
    year: numFromVal(d[`sf${i}y`]),
    nights: numFromVal(d[`sf${i}n`]),
    amt: numFromVal(d[`sf${i}a`]),
  }));
  const validFuture = futRows.filter((r) => r.amt > 0);
  const futureYears = Array.from(new Set(validFuture.map((r) => r.year).filter((y) => y > 0)));
  const futureYearCount = futureYears.length || 0;
  const futureNights = validFuture.reduce((a, r) => a + r.nights, 0);
  const futureSpend = validFuture.reduce((a, r) => a + r.amt, 0);
  const futureAvg = validFuture.length ? futureSpend / validFuture.length : 0;
  const futureVacYear = futureYearCount ? validFuture.length / futureYearCount : 0;
  const futureNightYear = futureYearCount ? futureNights / futureYearCount : 0;

  const sourcesVac = [histVacYear, futureVacYear].filter((v) => v > 0);
  const sourcesNight = [currentNights, histNightYear, futureNightYear].filter((v) => v > 0);
  const sourcesEng = [base, histAvg, futureAvg].filter((v) => v > 0);
  const sourcesMi = [currentMonthly, histAvg / 12, futureAvg / 12].filter((v) => v > 0);

  return {
    sType,
    split: { hpct: Math.round(hpct * 100), hval: total * hpct, vval: total * (1 - hpct) },
    trip: { dp: base, mi: currentMonthly },
    current: { vac: "N/A", night: currentNights, dp: base, mi: currentMonthly },
    hist: { vac: histVacYear, night: histNightYear, dp: histAvg, mi: histAvg / 12, nights: histNights, spend: histSpend, avg: histAvg },
    future: { vac: futureVacYear, night: futureNightYear, dp: futureAvg, mi: futureAvg / 12, nights: futureNights, spend: futureSpend },
    pattern: {
      vac: sourcesVac.length ? sourcesVac.reduce((a, b) => a + b, 0) / sourcesVac.length : 0,
      night: sourcesNight.length ? sourcesNight.reduce((a, b) => a + b, 0) / sourcesNight.length : 0,
      dp: sourcesEng.length ? sourcesEng.reduce((a, b) => a + b, 0) / sourcesEng.length : 0,
      mi: sourcesMi.length ? sourcesMi.reduce((a, b) => a + b, 0) / sourcesMi.length : 0,
    },
  };
}

export function surveyHasData(d: SurveyData): boolean {
  return Object.keys(d).some((k) => String(d[k] ?? "").trim() !== "");
}

export { fmt, fmtD, fmtN };
