/**
 * Fachada pura de expediente (API).
 * Sin Express, para que red y participantes no arrastren las rutas.
 */
export { canEditProspectRecord, canRegisterProspectSale } from "./dominio/acceso-edicion.js";
export { listSharesWithContact } from "./servicios/compartir-servicio.js";
export {
  loadVisibilityActor,
  listAssignedProspectIds,
  listSharedProspectIds,
  actorCanViewProspect,
  workflowAssignmentOrFilter,
  WORKFLOW_PERSON_COLUMNS,
} from "./servicios/visibilidad-expediente-servicio.js";
export {
  isVisibilityException,
  canViewProspectByPredicate,
} from "./dominio/visibilidad-expediente.js";
