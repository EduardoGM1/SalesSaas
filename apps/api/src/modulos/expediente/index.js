/**
 * Fachada pública — expediente (API).
 * Montaje de rutas solo desde aquí. OPC y Royal Holiday no entran.
 */
export { default as prospectsRouter } from "./rutas/prospectos.js";
export { default as sharesRouter } from "./rutas/compartir.js";
