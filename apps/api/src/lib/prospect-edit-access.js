/**
 * Reglas de edición de ficha prospects (sin pipeline).
 * Dueño, representante, cerrador y gerente pueden editar en sala.
 */
export function canEditProspectRecord({ actorId, prospect, workflow, permissions = new Set() }) {
  if (!actorId || !prospect) return false;
  if (prospect.user_id === actorId && permissions.has("expedientes:editar")) return true;
  if (workflow) {
    if (workflow.representante_id === actorId || workflow.cerrador_id === actorId) return true;
  }
  if (
    permissions.has("expedientes:ver_equipo")
    || permissions.has("workflow:revisar")
  ) {
    return true;
  }
  return false;
}
