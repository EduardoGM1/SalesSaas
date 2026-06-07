import { MONTHS } from "@/lib/constants";
import { getISOWeek } from "@/lib/format/dates";
import { CalMonth, GoalMonth } from "@/lib/storage/types";

export function countDescansoDays(data: CalMonth): number {
  return Object.values(data.days || {}).filter((es) =>
    (es || []).some((e) => e.t === "descanso")
  ).length;
}

export function isDescansoDay(data: CalMonth, d: number): boolean {
  return ((data.days || {})[d] || []).some((e) => e.t === "descanso");
}

export function workingDaysRemaining(year: number, month: number, data: CalMonth): number {
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

export interface DashboardWeek {
  weekNo: number;
  days: number[];
  worked: number;
  obj: number;
  real: number;
  tours: number;
  sales: number;
  range: string;
}

export function getDashboardWeeks(
  year: number,
  month: number,
  data: CalMonth,
  goal: GoalMonth
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
    };
    g.days.forEach((d) => {
      ((data.days || {})[d] || []).forEach((e) => {
        if (e.t === "venta") {
          week.real += e.vol || 0;
          week.tours += e.tours || 0;
          week.sales++;
        }
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

export function normalizeGoal(goal: GoalMonth | undefined): Required<Pick<GoalMonth, "vol" | "tours" | "ventas" | "dias" | "desc">> {
  const g = goal || {};
  return {
    vol: Number(g.vol) || 0,
    tours: Number(g.tours) || 0,
    ventas: Number(g.ventas) || 0,
    dias: Number(g.dias) || 0,
    desc: Number(g.desc) || 0,
  };
}

export function computeMetasKpis(
  year: number,
  month: number,
  data: CalMonth,
  vol: number,
  tours: number,
  ventas: number
) {
  const dim = new Date(year, month + 1, 0).getDate();
  const descDays = countDescansoDays(data);
  const trabajados = Math.max(1, dim - descDays);
  return {
    dim,
    descDays,
    trabajados,
    vprom: ventas > 0 ? vol / ventas : 0,
    efic: tours > 0 ? vol / tours : 0,
    cierre: tours > 0 ? (ventas / tours) * 100 : 0,
    prod: trabajados > 0 ? vol / trabajados : 0,
    semanal: vol > 0 ? vol / 4 : 0,
    toursDia: tours > 0 ? (tours / trabajados).toFixed(1) : "0",
  };
}
