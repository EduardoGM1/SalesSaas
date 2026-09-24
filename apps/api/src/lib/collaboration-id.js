/**
 * Identificadores de colaboración (Contrato, VLO, Prospect ID).
 * Letras y números. No usa la regla de nombre (una palabra, solo letras, 15).
 */
const COLLABORATION_ID_MAX = 40;

export function normalizeCollaborationId(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .slice(0, COLLABORATION_ID_MAX);
}

export function readCollaborationId(value, label) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = normalizeCollaborationId(raw);
  if (!normalized || normalized !== raw) {
    const error = new Error(`${label} solo acepta letras y números (máximo ${COLLABORATION_ID_MAX}).`);
    error.status = 400;
    throw error;
  }
  return normalized;
}
