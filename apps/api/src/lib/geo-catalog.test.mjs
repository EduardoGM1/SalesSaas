import assert from "node:assert/strict";
import test from "node:test";
import { listCountries, listCities, findCountry } from "./geo-catalog.js";
import { getCountries, getCities } from "../services/geo-service.js";
import { ServiceError } from "./service-error.js";

test("listCountries: catálogo no vacío con iso/flag/cityCount", () => {
  const countries = listCountries();
  assert.ok(Array.isArray(countries));
  assert.ok(countries.length > 5);
  const mx = countries.find((c) => c.name === "México");
  assert.ok(mx);
  assert.equal(mx.iso, "MX");
  assert.equal(typeof mx.flag, "string");
  assert.ok(mx.cityCount > 0);
});

test("findCountry: por nombre e ISO", () => {
  assert.equal(findCountry("México"), "México");
  assert.equal(findCountry("mx"), "México");
  assert.equal(findCountry("  México  "), "México");
  assert.equal(findCountry(""), null);
  assert.equal(findCountry("zz-no-existe-xyz"), null);
});

test("listCities: México incluye ciudades; país inválido null", () => {
  const data = listCities("México");
  assert.equal(data.country, "México");
  assert.ok(Array.isArray(data.cities));
  assert.ok(data.cities.includes("Ciudad de México") || data.cities.length > 0);
  assert.equal(listCities("no-existe-xyz"), null);
});

test("geo-service getCountries delega al catálogo", () => {
  assert.deepEqual(getCountries(), listCountries());
});

test("geo-service getCities lanza 404 si país no existe", () => {
  assert.throws(() => getCities("no-existe-xyz"), (err) => {
    assert.ok(err instanceof ServiceError);
    assert.equal(err.status, 404);
    return true;
  });
});
