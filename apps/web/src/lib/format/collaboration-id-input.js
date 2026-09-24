/**
 * Contrato, VLO y Prospect ID. Letras y números, hasta 40.
 * No aplica la regla de nombre (solo letras, una palabra, 15).
 */
const COLLABORATION_ID_MAX = 40;

export function formatCollaborationIdInput(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .slice(0, COLLABORATION_ID_MAX);
}
