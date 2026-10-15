/**
 * Entrada delgada banco/resolución Discovery (sin UI Survey).
 * Evita ciclos: configure-questions-modal ← SurveyPage vía index.
 */
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
