/**
 * Fachada pública — survey (fase 5b.1: dominio/cálculo + paneles de cálculo).
 * Shell survey-page, Discovery UI, collab y API quedan fuera (deuda 5b.2+).
 */
export {
  calcularSurvey,
  computeSurvey,
  encuestaTieneDatos,
  surveyHasData,
  type SurveyData,
  type SurveyCalcResult,
} from "./dominio/calculo-survey";

export { GastosPanel } from "./ui/gastos-panel.jsx";
export { ResumenPanel } from "./ui/resumen-panel.jsx";
export { TimesharePanel } from "./ui/timeshare-panel.jsx";
