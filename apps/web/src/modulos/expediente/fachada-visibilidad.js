/**
 * Entrada delgada — visibilidad de clientes en sala (allowlist UI).
 * Agenda/Metas/lib espejo importan aquí; no dominio/servicios internos.
 */
export {
  scopeClientsForList,
  scopeClientsForDerivedViews,
  scopeCalMonthForDerivedViews,
} from "./servicios/acciones-expediente.js";

export {
  filterClientsVisibles,
  filterCalMonthVisibles,
  localIdsToPurgeAfterMirror,
} from "./dominio/clientes-visibles.js";

export {
  getVisibleProspectIds,
  setVisibleProspectIds,
  mergeVisibleProspectIds,
} from "./dominio/visible-prospects-cache.js";
