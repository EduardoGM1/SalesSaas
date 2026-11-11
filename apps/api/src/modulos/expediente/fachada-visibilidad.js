/**
 * Fachada delgada de visibilidad para sync (evita cargar toda fachada-node).
 */
export {
  resolveSyncPullVisibility,
  listOwnedProspectIds,
  listAssignedProspectIds,
  listSharedProspectIds,
  loadVisibilityActor,
  actorCanViewProspect,
  workflowAssignmentOrFilter,
  WORKFLOW_PERSON_COLUMNS,
} from "./servicios/visibilidad-expediente-servicio.js";

export {
  isVisibilityException,
  canViewProspectByPredicate,
} from "./dominio/visibilidad-expediente.js";
