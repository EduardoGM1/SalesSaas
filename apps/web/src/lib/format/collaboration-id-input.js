/**
 * Contrato, VLO y Prospect ID.
 * No recorta letras, números, espacios ni guiones. Solo el tope de 40.
 * No aplica la regla de nombre (solo letras, una palabra, 15).
 */
const COLLABORATION_ID_MAX = 40;

export function formatCollaborationIdInput(value) {
  return String(value ?? "").slice(0, COLLABORATION_ID_MAX);
}
