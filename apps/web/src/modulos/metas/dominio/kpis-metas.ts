/**
 * Cálculos puros de metas (KPIs del mes). Claves GoalMonth (vol, tours, ventas, dias, desc) no se renombran.
 */
import { countDescansoDays } from "@/modulos/agenda/fachada-node.js";
import type { CalMonth, GoalMonth } from "@/lib/storage/types";

export function normalizarMeta(
  goal: GoalMonth | undefined,
): Required<Pick<GoalMonth, "vol" | "tours" | "ventas" | "dias" | "desc">> {
  const g = goal || {};
  return {
    vol: Number(g.vol) || 0,
    tours: Number(g.tours) || 0,
    ventas: Number(g.ventas) || 0,
    dias: Number(g.dias) || 0,
    desc: Number(g.desc) || 0,
  };
}

/** Alias de contrato interno amplio (consumidores previos). */
export const normalizeGoal = normalizarMeta;

export function calcularKpisMetas(
  year: number,
  month: number,
  data: CalMonth,
  vol: number,
  tours: number,
  ventas: number,
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

/** Alias de contrato interno amplio. */
export const computeMetasKpis = calcularKpisMetas;
