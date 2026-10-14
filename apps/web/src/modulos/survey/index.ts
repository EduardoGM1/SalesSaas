/**
 * Fachada pública — survey (fase 5a: solo dominio/cálculo).
 * UI, collab, preguntas personalizables y API quedan fuera (deuda 5b).
 */
export {
  calcularSurvey,
  computeSurvey,
  encuestaTieneDatos,
  surveyHasData,
  type SurveyData,
  type SurveyCalcResult,
} from "./dominio/calculo-survey";
