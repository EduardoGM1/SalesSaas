export const SINGLE_NAME_MAX_LENGTH = 15;

/** Una sola palabra de referencia: sin espacios/apellidos, solo letras, máx. 15. */
export function formatSingleNameInput(value) {
  const firstWord = String(value ?? "")
    .normalize("NFC")
    .trim()
    .split(/\s+/)[0] || "";
  return firstWord
    .replace(/[^\p{L}\p{M}]/gu, "")
    .slice(0, SINGLE_NAME_MAX_LENGTH);
}

export function isValidSingleName(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0
    && trimmed.length <= SINGLE_NAME_MAX_LENGTH
    && !/\s/.test(trimmed)
    && /^[\p{L}\p{M}]+$/u.test(trimmed);
}
