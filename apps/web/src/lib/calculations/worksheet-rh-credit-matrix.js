/** Filas/columnas de la matriz Créditos (temporada × opción) del worksheet RH. */
export const RH_CREDIT_MATRIX_ROWS = ["Alta", "Media", "Baja"];
export const RH_CREDIT_MATRIX_COLS = ["N.1", "N.2", "N.3"];

/**
 * Agrupa rh_bottom_line del catálogo en matriz 3×3 (N.1–N.3 × Alta/Media/Baja) por HC.
 * Misma lógica que el worksheet RH antes del rediseño Datos Venta (commit 984534a).
 */
export function buildRhCreditMatrix(bottomLine) {
  const sorted = [...(bottomLine || [])].sort(
    (a, b) => Number(a.holiday_credits) - Number(b.holiday_credits),
  );
  const matrix = RH_CREDIT_MATRIX_ROWS.map(() => RH_CREDIT_MATRIX_COLS.map(() => null));
  sorted.slice(0, 9).forEach((row, i) => {
    const r = Math.floor(i / 3);
    const c = i % 3;
    if (r < 3 && c < 3) matrix[r][c] = row;
  });
  return matrix;
}
