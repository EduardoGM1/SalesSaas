/**
 * Días de descanso en el mes de agenda (dominio puro).
 * Contratos de entrada: t === "descanso" (no renombrar).
 */
export function contarDiasDescanso(data) {
  return Object.values(data?.days || {}).filter((es) =>
    (es || []).some((e) => e.t === "descanso"),
  ).length;
}

export function esDiaDescanso(data, d) {
  return ((data?.days || {})[d] || []).some((e) => e.t === "descanso");
}

/** Alias EN (consumidores previos / metas). */
export const countDescansoDays = contarDiasDescanso;
export const isDescansoDay = esDiaDescanso;
