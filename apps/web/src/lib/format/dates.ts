import { getMonths } from "@/lib/i18n.js";

export function ymdToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseYMD(s: string): Date | null {
  const [y, m, d] = String(s || "").split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

export function longDate(s: string, lang: "es" | "en" = "es"): string {
  const d = parseYMD(s);
  if (!d) return s || "—";
  const months = getMonths(lang);
  if (lang === "en") {
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }
  return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
}

export function calKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
