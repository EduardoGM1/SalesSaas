/**
 * Fachada pura de expediente (API).
 * Sin Express, para que red y participantes no arrastren las rutas.
 */
export { canEditProspectRecord, canRegisterProspectSale } from "./dominio/acceso-edicion.js";
export { listSharesWithContact } from "./servicios/compartir-servicio.js";
