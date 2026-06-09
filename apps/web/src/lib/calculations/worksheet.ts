import { WS_DEFAULTS } from "@/lib/constants";
import { parseMoney } from "@/lib/format/money";

export function pmt(P: number, n: number, ra: number): number {
  if (n <= 0) return 0;
  if (ra === 0) return P / n;
  const i = ra / 100 / 12;
  return (P * (i * Math.pow(1 + i, n))) / (Math.pow(1 + i, n) - 1);
}

export interface WSOptionResult {
  months: number;
  rate: number;
  monthly: number;
  total: number;
}

export interface WSCalcResult {
  vol: number;
  engPct: number;
  cc: number;
  ob: number;
  eng: number;
  engCc: number;
  bal: number;
  options: WSOptionResult[];
}

export function ensureWSConfig(d: Record<string, string | number>): Record<string, string | number> {
  const out = { ...d };
  Object.entries(WS_DEFAULTS).forEach(([k, v]) => {
    if (out[k] == null || String(out[k]).trim() === "") out[k] = v;
  });
  return out;
}

export function computeWorksheet(
  fields: Record<string, string | number>,
  config: Record<string, string | number>
): WSCalcResult {
  const cfg = ensureWSConfig(config);
  const v = parseMoney(fields.wv);
  const ep = parseMoney(fields.we) / 100;
  const cc = parseMoney(fields.wcc);
  const ob = parseMoney(fields.wob);
  const eng = v * ep;
  const bal = v - eng + ob;

  const options = [1, 2, 3].map((i) => {
    const m = parseFloat(String(cfg[`wo${i}m`] ?? WS_DEFAULTS[`wo${i}m`]).replace(/,/g, "")) || 0;
    const r = parseFloat(String(cfg[`wo${i}r`] ?? WS_DEFAULTS[`wo${i}r`]).replace(/,/g, "")) || 0;
    const mi = m > 0 ? pmt(bal, m, r) : 0;
    const tot = m > 0 ? mi * m + eng : 0;
    return { months: m, rate: r, monthly: mi, total: tot };
  });

  return { vol: v, engPct: ep * 100, cc, ob, eng, engCc: eng + cc, bal, options };
}
