/**
 * Fachada pública — survey (fase 5b.4: dominio + UI + catálogo i18n Discovery).
 * Banco/resolución de preguntas, collab compartido y API quedan fuera (deuda 5b.5+).
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
export { MotivacionesPanel } from "./ui/motivaciones-panel.jsx";
export { MembershipTable } from "./ui/membership-table.jsx";
export { ChipQuestion, StyleMicroGrid } from "./ui/chip-question.jsx";

export { ES_SURVEY_DISC, EN_SURVEY_DISC } from "./i18n/catalogo-discovery.js";
