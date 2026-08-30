/**
 * Catálogo geo estático (público).
 */
import * as geoService from "../services/geo-service.js";

export function listarPaises() {
  return geoService.getCountries();
}

export function listarCiudades(country) {
  return geoService.getCities(country);
}
