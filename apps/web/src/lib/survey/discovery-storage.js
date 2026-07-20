import {
  ALL_DISCOVERY_QUESTIONS,
  emptyMembership,
  HAS_TS_QUESTION,
  MEMBERSHIP_TYPE_KEYS,
  PROGRESS_QUESTION_IDS,
  YES_NO_KEYS,
} from "@/lib/survey/discovery-questions.js";
import { LEGACY_OPTION_TEXT_TO_KEY } from "@/lib/survey/legacy-option-map.js";
import { isCustomOptionKey, resolveOptionDisplayLabel } from "@/lib/survey/option-labels.js";

const QUESTION_BY_ID = new Map(ALL_DISCOVERY_QUESTIONS.map((q) => [q.id, q]));

function emptyDiscovery() {
  return { answers: {}, contexts: {}, hasTs: "", memberships: [emptyMembership()] };
}

export function parseDiscovery(raw) {
  if (!raw) return emptyDiscovery();
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const base = {
      answers: parsed.answers && typeof parsed.answers === "object" ? parsed.answers : {},
      contexts: parsed.contexts && typeof parsed.contexts === "object" ? parsed.contexts : {},
      hasTs: typeof parsed.hasTs === "string" ? parsed.hasTs : "",
      memberships: Array.isArray(parsed.memberships) ? parsed.memberships : [],
    };
    return normalizeDiscovery(base);
  } catch {
    return emptyDiscovery();
  }
}

export function serializeDiscovery(disc) {
  const normalized = normalizeDiscovery(disc || {});
  return JSON.stringify({
    answers: normalized.answers,
    contexts: normalized.contexts,
    hasTs: normalized.hasTs,
    memberships: normalized.memberships,
  });
}

export function countAnswered(disc, questionIds = PROGRESS_QUESTION_IDS) {
  let n = 0;
  for (const id of questionIds || PROGRESS_QUESTION_IDS) {
    const sel = disc.answers?.[id];
    if (Array.isArray(sel) && sel.length > 0) n += 1;
  }
  return n;
}

/** Normaliza opciones del banco (texto ES histórico → clave). */
export function normalizeOpcionesArray(questionId, opciones) {
  if (!Array.isArray(opciones)) return [];
  const allowed = new Set(QUESTION_BY_ID.get(questionId)?.optionKeys || []);
  return opciones
    .map((o) => {
      const s = String(o);
      if (allowed.has(s)) return s;
      return LEGACY_OPTION_TEXT_TO_KEY[`${questionId}::${s}`] || s;
    })
    .filter((k) => allowed.size === 0 || allowed.has(k));
}

export function normalizeSelectedKeys(questionId, selected) {
  if (!Array.isArray(selected)) return [];
  const allowed = new Set(QUESTION_BY_ID.get(questionId)?.optionKeys || []);
  const out = [];
  for (const raw of selected) {
    const s = String(raw);
    let key = s;
    if (!allowed.has(s) && !isCustomOptionKey(s)) {
      key = LEGACY_OPTION_TEXT_TO_KEY[`${questionId}::${s}`] || s;
    }
    // Banco canónico o custom del vendedor (Nivel B)
    if ((allowed.has(key) || isCustomOptionKey(key)) && !out.includes(key)) out.push(key);
  }
  return out;
}

function normalizeYesNo(value) {
  if (!value) return "";
  if (YES_NO_KEYS.includes(value)) return value;
  return LEGACY_OPTION_TEXT_TO_KEY[`memb::${value}`] || value;
}

function normalizeMembershipType(value) {
  if (!value) return "";
  if (MEMBERSHIP_TYPE_KEYS.includes(value)) return value;
  return LEGACY_OPTION_TEXT_TO_KEY[`memb::${value}`] || value;
}

/** Migra respuestas históricas (texto ES) a claves estables. */
export function normalizeDiscovery(disc) {
  const answers = {};
  for (const [qid, sel] of Object.entries(disc.answers || {})) {
    answers[qid] = normalizeSelectedKeys(qid, sel);
  }

  let hasTs = disc.hasTs || "";
  if (hasTs) {
    const allowed = new Set(HAS_TS_QUESTION.optionKeys);
    if (!allowed.has(hasTs)) {
      hasTs = LEGACY_OPTION_TEXT_TO_KEY[`hasTs::${hasTs}`]
        || LEGACY_OPTION_TEXT_TO_KEY[`${HAS_TS_QUESTION.id}::${hasTs}`]
        || hasTs;
    }
    if (!allowed.has(hasTs)) hasTs = "";
  }

  const memberships = (disc.memberships || []).map((m) => ({
    ...m,
    paysMaint: normalizeYesNo(m.paysMaint),
    paidFull: normalizeYesNo(m.paidFull),
    type: normalizeMembershipType(m.type),
  }));

  return {
    answers,
    contexts: disc.contexts || {},
    hasTs,
    // Fila base preestablecida: siempre al menos una membresía editable.
    memberships: memberships.length ? memberships : [emptyMembership()],
  };
}

export function joinSelectedTranslated(selected, questionId, t, questionCtx = null) {
  if (!Array.isArray(selected) || !selected.length) return "";
  const ctx = questionCtx || { optionLabels: {}, activeKeys: null };
  return selected
    .map((key) => resolveOptionDisplayLabel(questionId, key, ctx, t))
    .join(" · ");
}
