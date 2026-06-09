import { listCountries, listCities } from "../lib/geo-catalog.js";
import { ServiceError } from "../lib/service-error.js";

export function getCountries() {
  return listCountries();
}

export function getCities(country) {
  const data = listCities(country);
  if (!data) throw new ServiceError("País no encontrado.", 404);
  return data;
}
