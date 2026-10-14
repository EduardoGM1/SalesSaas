/**
 * Validación pura de year/month para DELETE /api/v1/goals.
 * Contratos HTTP y columnas BD (goals) no se renombran aquí.
 */
export function validarPeriodoMeta(year, month) {
  if (!Number.isInteger(year) || year < 2000 || !Number.isInteger(month) || month < 0 || month > 11) {
    return { ok: false, error: "year y month requeridos." };
  }
  return { ok: true };
}
