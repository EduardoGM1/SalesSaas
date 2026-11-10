import {
  clientTourDate,
  isTourSummaryClient,
  isYmdInMonth,
} from "@/lib/calculations/tour-summary";
import type { ClientRecord } from "@/lib/storage/types";

/** Expedientes con tour en el día visible del calendario (misma regla que el dashboard). */
export function tourClientsForDay(
  clients: Record<string, ClientRecord> | ClientRecord[] | null | undefined,
  year: number,
  month: number,
  day: number,
): ClientRecord[] {
  const list = Array.isArray(clients)
    ? clients
    : Object.values(clients || {});
  const dayNum = Number(day);
  if (!Number.isFinite(dayNum) || dayNum < 1) return [];
  return list.filter((c) => {
    if (!isTourSummaryClient(c)) return false;
    const ymd = clientTourDate(c);
    if (!isYmdInMonth(ymd, year, month)) return false;
    return Number(String(ymd).slice(8, 10)) === dayNum;
  });
}

/** Días del mes (1–31) con al menos un tour de expediente. */
export function tourDaysInMonth(
  clients: Record<string, ClientRecord> | ClientRecord[] | null | undefined,
  year: number,
  month: number,
): Set<number> {
  const days = new Set<number>();
  const list = Array.isArray(clients)
    ? clients
    : Object.values(clients || {});
  for (const c of list) {
    if (!isTourSummaryClient(c)) continue;
    const ymd = clientTourDate(c);
    if (!isYmdInMonth(ymd, year, month)) continue;
    const d = Number(String(ymd).slice(8, 10));
    if (Number.isFinite(d) && d >= 1) days.add(d);
  }
  return days;
}
