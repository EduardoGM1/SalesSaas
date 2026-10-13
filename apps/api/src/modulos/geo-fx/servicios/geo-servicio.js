import { listarPaises, listarCiudades } from "../dominio/catalogo-geo.js";
import { ServiceError } from "../../../lib/service-error.js";

export function obtenerPaises() {
  return listarPaises();
}

export function obtenerCiudades(pais) {
  const data = listarCiudades(pais);
  if (!data) throw new ServiceError("País no encontrado.", 404);
  return data;
}
