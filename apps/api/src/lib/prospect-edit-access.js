/**
 * Reglas de edición de ficha prospects (sin pipeline).
 * Dueño, representante, cerrador y gerente pueden editar en sala.
 * "ver_equipo" solo no basta: exige rol/permiso de revisión de gerente.
 */
export function canEditProspectRecord({ actorId, prospect, workflow, permissions = new Set(), memberRole = null }) {
  if (!actorId || !prospect) return false;
  if (prospect.user_id === actorId && permissions.has("expedientes:editar")) return true;
  if (workflow) {
    if (workflow.representante_id === actorId || workflow.cerrador_id === actorId) return true;
  }
  if (memberRole === "gerente" || permissions.has("workflow:revisar")) return true;
  if (permissions.has("expedientes:editar") && permissions.has("expedientes:ver_equipo")) return true;
  return false;
}
