import { buildFallbackBankRows } from "@/lib/survey/fallback-bank.js";

/**
 * Combina banco global + overrides de usuario.
 * @param {object[]} bankRows filas survey_preguntas
 * @param {object[]} overrides filas survey_preguntas_usuario
 * @param {{ includeInactive?: boolean }} [opts]
 */
export function mergeSurveyQuestions(bankRows, overrides = [], opts = {}) {
  const byPregunta = new Map(
    (overrides || []).map((o) => [o.pregunta_id, o]),
  );
  const merged = (bankRows || []).map((row) => {
    const ov = byPregunta.get(row.id);
    return {
      ...row,
      opciones: Array.isArray(row.opciones) ? row.opciones : [],
      activa: ov ? ov.activa !== false : true,
      orden: ov?.orden != null ? Number(ov.orden) : Number(row.orden) || 0,
      override: ov || null,
    };
  });
  merged.sort((a, b) => {
    if (a.seccion !== b.seccion) return a.seccion.localeCompare(b.seccion);
    if (a.orden !== b.orden) return a.orden - b.orden;
    return String(a.clave).localeCompare(String(b.clave));
  });
  if (opts.includeInactive) return merged;
  return merged.filter((r) => r.activa);
}

/** Forma usada por ChipQuestion. */
export function toChipQuestion(row, displayNumber) {
  return {
    id: row.clave,
    number: displayNumber ?? row.numero ?? undefined,
    title: row.texto,
    max: row.max_seleccion ?? 1,
    options: Array.isArray(row.opciones) ? row.opciones : [],
    withContext: row.with_context !== false,
  };
}

export function toStyleQuestion(row) {
  return {
    id: row.clave,
    label: row.label_corto || row.texto,
    max: row.max_seleccion ?? 1,
    options: Array.isArray(row.opciones) ? row.opciones : [],
  };
}

/**
 * Agrupa preguntas activas para los paneles.
 * Renumera las preguntas "main" (no style / has_ts) en orden visual.
 */
export function groupResolvedQuestions(mergedActive) {
  const motivaciones = (mergedActive || []).filter((r) => r.seccion === "motivaciones");
  const timeshare = (mergedActive || []).filter((r) => r.seccion === "timeshare");

  const before = motivaciones.filter((r) => r.bloque === "before_style");
  const style = motivaciones.filter((r) => r.bloque === "style");
  const after = motivaciones.filter((r) => r.bloque === "after_style");

  let n = 1;
  const beforeQs = before.map((r) => toChipQuestion(r, n++));
  const afterQs = after.map((r) => toChipQuestion(r, n++));
  const styleQs = style.map(toStyleQuestion);

  const mainTs = timeshare.filter((r) => r.bloque === "main");
  const hasTsRow = timeshare.find((r) => r.bloque === "has_ts" || r.clave === "hasTs");
  let tn = 1;
  const timeshareQs = mainTs.map((r) => toChipQuestion(r, tn++));
  const hasTs = hasTsRow
    ? toChipQuestion(hasTsRow, undefined)
    : null;

  const progressIds = [
    ...beforeQs.map((q) => q.id),
    ...afterQs.map((q) => q.id),
    ...timeshareQs.map((q) => q.id),
  ];

  return {
    motivacionesBefore: beforeQs,
    styleQuestions: styleQs,
    motivacionesAfter: afterQs,
    timeshareQuestions: timeshareQs,
    hasTsQuestion: hasTs,
    progressIds,
    allActive: mergedActive,
  };
}

export function fallbackGroupedQuestions() {
  return groupResolvedQuestions(mergeSurveyQuestions(buildFallbackBankRows(), [], { includeInactive: false }));
}
