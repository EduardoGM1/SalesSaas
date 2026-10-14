/**
 * Agenda: conteo de ventas en calendario.
 * Metas (normalizeGoal, computeMetasKpis, getDashboardWeeks, workingDaysRemaining)
 * viven en `modulos/metas` (fachada) — reexports de adaptador para imports legacy.
 */
export { countDescansoDays, isDescansoDay } from "./calendar-descansos.js";
export {
  normalizarMeta,
  normalizeGoal,
  calcularKpisMetas,
  computeMetasKpis,
  diasLaborablesRestantes,
  workingDaysRemaining,
  obtenerSemanasTablero,
  getDashboardWeeks,
  type DashboardSaleItem,
  type DashboardWeek,
} from "@/modulos/metas";

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
