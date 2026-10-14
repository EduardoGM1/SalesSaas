/**
 * Días de descanso en el mes de agenda (compartido agenda ↔ metas).
 * Extraído para que el dominio metas no importe el calendar monolítico.
 */
export function countDescansoDays(data) {
  return Object.values(data?.days || {}).filter((es) =>
    (es || []).some((e) => e.t === "descanso"),
  ).length;
}

export function isDescansoDay(data, d) {
  return ((data?.days || {})[d] || []).some((e) => e.t === "descanso");
}
