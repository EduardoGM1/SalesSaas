import { COUNTRY_CITY, COUNTRY_FLAGS } from "@salesapp/shared/constants.js";

const COUNTRY_ISO = {
  México: "MX",
  "Estados Unidos": "US",
  Canadá: "CA",
  Colombia: "CO",
  Brasil: "BR",
  Argentina: "AR",
  Chile: "CL",
  Perú: "PE",
  España: "ES",
  "Reino Unido": "GB",
  Francia: "FR",
  Alemania: "DE",
  Italia: "IT",
  Australia: "AU",
  "Costa Rica": "CR",
  Panamá: "PA",
  Guatemala: "GT",
  Ecuador: "EC",
  Uruguay: "UY",
  Paraguay: "PY",
  Bolivia: "BO",
  "República Dominicana": "DO",
  "Puerto Rico": "PR",
  "Países Bajos": "NL",
  Suiza: "CH",
  Bélgica: "BE",
  Portugal: "PT",
  Suecia: "SE",
  Noruega: "NO",
  Dinamarca: "DK",
  Irlanda: "IE",
  Japón: "JP",
  "Corea del Sur": "KR",
  China: "CN",
  India: "IN",
  "Emiratos Árabes Unidos": "AE",
  Israel: "IL",
  Sudáfrica: "ZA",
  Otro: "XX",
};

export function listCountries() {
  return Object.keys(COUNTRY_CITY).map((name) => ({
    name,
    iso: COUNTRY_ISO[name] ?? null,
    flag: COUNTRY_FLAGS[name] ?? "🌐",
    cityCount: (COUNTRY_CITY[name] ?? []).length,
  }));
}

export function findCountry(query) {
  const q = String(query ?? "").trim();
  if (!q) return null;
  const byIso = Object.entries(COUNTRY_ISO).find(([, iso]) => iso.toLowerCase() === q.toLowerCase());
  if (byIso) return byIso[0];
  const exact = Object.keys(COUNTRY_CITY).find((n) => n.toLowerCase() === q.toLowerCase());
  if (exact) return exact;
  return Object.keys(COUNTRY_CITY).find((n) => n.toLowerCase().includes(q.toLowerCase())) ?? null;
}

export function listCities(countryName) {
  const name = findCountry(countryName);
  if (!name) return null;
  return {
    country: name,
    iso: COUNTRY_ISO[name] ?? null,
    flag: COUNTRY_FLAGS[name] ?? "🌐",
    cities: COUNTRY_CITY[name] ?? [],
  };
}
