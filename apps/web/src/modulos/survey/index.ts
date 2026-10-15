/**
 * Fachada pública — survey (fase 5b.2: dominio + paneles + shell SurveyPage).
 * Discovery UI, collab y API quedan fuera (deuda 5b.3+).
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
export { SurveyPage } from "./ui/survey-page.jsx";
