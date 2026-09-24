/**
 * Identificadores de colaboración (Contrato, VLO, Prospect ID).
 * Letras, números, espacios y guiones, tal como se escribieron.
 * No usa la regla de nombre (una palabra, solo letras, 15).
 */
const COLLABORATION_ID_MAX = 40;
const COLLABORATION_ID_PATTERN = /^[\p{L}\p{N} -]+$/u;

export function readCollaborationId(value, label) {
  if (value == null) return null;
  const raw = String(value);
  if (raw.trim() === "") return null;
  if (raw.length > COLLABORATION_ID_MAX || !COLLABORATION_ID_PATTERN.test(raw)) {
    const error = new Error(
      `${label} solo acepta letras, números, espacios y guiones (máximo ${COLLABORATION_ID_MAX}).`,
    );
    error.status = 400;
    throw error;
  }
  return raw;
}
