/**
 * Fachada pública — metas (web).
 * Otros módulos / UI legacy solo importan desde aquí.
 */
export {
  normalizarMeta,
  normalizeGoal,
  calcularKpisMetas,
  computeMetasKpis,
} from "./dominio/kpis-metas";

export {
  diasLaborablesRestantes,
  workingDaysRemaining,
  obtenerSemanasTablero,
  getDashboardWeeks,
  type DashboardSaleItem,
  type DashboardWeek,
} from "./dominio/semanas-tablero";
