/**
 * TC captura USD→MXN: valores ≤ 1 o no numéricos se tratan como ausentes
 * (evita reinfectar profiles.settings / sts4_user_v1 con exchangeRate=1).
 * @param {unknown} rate
 * @returns {number|undefined} tasa válida (> 1) o undefined si ausente/inválida
 */
export function normalizeUsdToMxnRate(rate) {
  if (rate === null || rate === undefined || rate === "") return undefined;
  const n = Number(rate);
  if (!Number.isFinite(n) || n <= 1) return undefined;
  return n;
}
