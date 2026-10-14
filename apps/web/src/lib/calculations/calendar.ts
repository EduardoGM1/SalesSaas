/**
 * Agenda: conteo de ventas en calendario.
 * Metas (normalizeGoal, computeMetasKpis, getDashboardWeeks, workingDaysRemaining)
 * viven en `modulos/metas/dominio/` — reexports de adaptador para imports legacy.
 */
export { countDescansoDays, isDescansoDay } from "./calendar-descansos.js";
export {
  normalizarMeta,
  normalizeGoal,
  calcularKpisMetas,
  computeMetasKpis,
} from "@/modulos/metas/dominio/kpis-metas";
export {
  diasLaborablesRestantes,
  workingDaysRemaining,
  obtenerSemanasTablero,
  getDashboardWeeks,
  type DashboardSaleItem,
  type DashboardWeek,
} from "@/modulos/metas/dominio/semanas-tablero";

export function isCalendarSaleCountable(entry: {
  t?: string;
  status?: string;
  processing?: string;
  completed?: boolean;
}): boolean {
  return (
    !!entry
    && entry.t === "venta"
    && !entry.completed
    && String(entry.status || "venta") !== "pendiente"
    && String(entry.processing || "venta") !== "pendiente"
  );
}
