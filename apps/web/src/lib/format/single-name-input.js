export const SINGLE_NAME_MAX_LENGTH = 15;

/** Una sola palabra: sin espacios, solo letras, máximo 15 caracteres. */
export function formatSingleNameInput(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\s+/g, "")
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
