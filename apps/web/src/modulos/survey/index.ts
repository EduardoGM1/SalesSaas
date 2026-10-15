/**
 * Fachada pública — survey (fase 5b.5: dominio + banco/resolución + UI + i18n).
 * API de preguntas (survey-questions-api), collab compartido y modal de config quedan fuera.
 */
export {
  calcularSurvey,
  computeSurvey,
  encuestaTieneDatos,
  surveyHasData,
  type SurveyData,
  type SurveyCalcResult,
} from "./dominio/calculo-survey";

export {
  MOTIVACIONES_BEFORE_STYLE,
  STYLE_QUESTIONS,
  MOTIVACIONES_AFTER_STYLE,
  MOTIVACIONES_QUESTIONS,
  TIMESHARE_QUESTIONS,
  HAS_TS_QUESTION,
  MEMBERSHIP_TYPE_KEYS,
  YES_NO_KEYS,
  MEMBERSHIP_TYPES,
  YES_NO,
  PROGRESS_QUESTION_IDS,
  ALL_DISCOVERY_QUESTIONS,
  emptyMembership,
  toggleChip,
  optionTitleKey,
  questionTitleKey,
  questionLabelKey,
} from "./dominio/discovery-questions.js";

export { LEGACY_OPTION_TEXT_TO_KEY } from "./dominio/legacy-option-map.js";

export { buildFallbackBankRows } from "./dominio/fallback-bank.js";

export {
  mergeSurveyQuestions,
  toChipQuestion,
  toStyleQuestion,
  groupResolvedQuestions,
  fallbackGroupedQuestions,
} from "./dominio/resolve-survey-questions.js";

export {
  isCustomOptionKey,
  parseOpcionesOverride,
  resolveOptionDisplayLabel,
  newCustomOptionKey,
  opcionesOverrideOrNull,
} from "./dominio/option-labels.js";

export {
  parseDiscovery,
  serializeDiscovery,
  countAnswered,
  normalizeOpcionesArray,
  normalizeSelectedKeys,
  normalizeDiscovery,
  joinSelectedTranslated,
} from "./dominio/discovery-storage.js";

export { GastosPanel } from "./ui/gastos-panel.jsx";
export { ResumenPanel } from "./ui/resumen-panel.jsx";
export { TimesharePanel } from "./ui/timeshare-panel.jsx";
export { SurveyPage } from "./ui/survey-page.jsx";
export { MotivacionesPanel } from "./ui/motivaciones-panel.jsx";
export { MembershipTable } from "./ui/membership-table.jsx";
export { ChipQuestion, StyleMicroGrid } from "./ui/chip-question.jsx";

export { ES_SURVEY_DISC, EN_SURVEY_DISC } from "./i18n/catalogo-discovery.js";
