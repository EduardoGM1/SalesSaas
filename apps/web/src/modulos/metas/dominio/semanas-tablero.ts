/**
 * Semanas del tablero de metas (dashboard /goals).
 * Depende de ventas/agenda (collectSalesForMonth) — no migra sync/outbox.
 */
import { MONTHS } from "@/lib/constants";
import { getISOWeek } from "@/lib/format/dates";
import { countDescansoDays, isDescansoDay } from "@/modulos/agenda";
import { collectSalesForMonth, isSaleCountable, isSaleTourCountable } from "@/lib/sales/agenda-sales";
import type { CalMonth, ClientRecord, GoalMonth } from "@/lib/storage/types";

export interface DashboardSaleItem {
  saleId?: string;
  vol: number;
  tours: number;
  contract?: string;
  clientName?: string;
  note?: string;
  day: number;
  date: string;
}

export interface DashboardWeek {
  weekNo: number;
  days: number[];
  worked: number;
  obj: number;
  real: number;
  tours: number;
  sales: number;
  range: string;
  saleItems: DashboardSaleItem[];
}

export function diasLaborablesRestantes(year: number, month: number, data: CalMonth): number {
  const dim = new Date(year, month + 1, 0).getDate();
  const now = new Date();
  const monthStart = new Date(year, month, 1);
  const curMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  if (monthStart < curMonthStart) return 0;
  let startDay = 1;
  if (monthStart.getTime() === curMonthStart.getTime()) startDay = now.getDate();
  let count = 0;
  for (let d = startDay; d <= dim; d++) {
    if (!isDescansoDay(data, d)) count++;
  }
  return count;
}

export const workingDaysRemaining = diasLaborablesRestantes;

export function obtenerSemanasTablero(
  year: number,
  month: number,
  data: CalMonth,
  goal: GoalMonth,
  clients: Record<string, ClientRecord> = {},
): DashboardWeek[] {
  const dim = new Date(year, month + 1, 0).getDate();
  const groups: { weekNo: number; days: number[] }[] = [];
  let cur: { weekNo: number; days: number[] } | null = null;

  for (let d = 1; d <= dim; d++) {
    const dt = new Date(year, month, d);
    const wn = getISOWeek(dt);
    if (!cur || cur.weekNo !== wn) {
      cur = { weekNo: wn, days: [] };
      groups.push(cur);
    }
    cur.days.push(d);
  }

  const monthSales = collectSalesForMonth(clients, year, month);
  const totalWorked = Math.max(0, dim - countDescansoDays(data));
  const dailyTarget = (goal.vol || 0) > 0 && totalWorked > 0 ? (goal.vol || 0) / totalWorked : 0;
  let lastWorkedIndex = -1;

  const weeks: DashboardWeek[] = groups.map((g, i) => {
    const worked = g.days.filter((d) => !isDescansoDay(data, d)).length;
    if (worked > 0) lastWorkedIndex = i;
    const week: DashboardWeek = {
      weekNo: g.weekNo,
      days: g.days,
      worked,
      obj: worked * dailyTarget,
      real: 0,
      tours: 0,
      sales: 0,
      range: `${g.days[0]}–${g.days[g.days.length - 1]} ${MONTHS[month]}`,
      saleItems: [],
    };
    g.days.forEach((d) => {
      const ymd = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      monthSales.filter((sale) => sale.day === d).forEach((sale) => {
        if (isSaleTourCountable(sale)) {
          week.tours += sale.tours || 1;
        }
        if (!isSaleCountable(sale)) return;
        week.real += sale.vol || 0;
        week.sales++;
        week.saleItems.push({
          saleId: sale.saleId,
          vol: sale.vol || 0,
          tours: sale.tours || 1,
          contract: sale.contract,
          clientName: sale.clientName,
          note: sale.note,
          day: d,
          date: ymd,
        });
      });
    });
    return week;
  });

  if (lastWorkedIndex >= 0 && (goal.vol || 0) > 0) {
    const before = weeks.reduce((a, g, i) => (i === lastWorkedIndex ? a : a + (g.obj || 0)), 0);
    weeks[lastWorkedIndex].obj = Math.max(0, (goal.vol || 0) - before);
  }

  return weeks;
}

export const getDashboardWeeks = obtenerSemanasTablero;
