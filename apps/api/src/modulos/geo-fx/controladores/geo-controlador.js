/**
 * Catálogo geo estático (público).
 */
import * as geoServicio from "../servicios/geo-servicio.js";

export function listarPaises() {
  return geoServicio.obtenerPaises();
}

export function listarCiudades(country) {
  return geoServicio.obtenerCiudades(country);
}
