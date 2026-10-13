import assert from "node:assert/strict";
import test from "node:test";
import { listarPaises, listarCiudades, buscarPais } from "./catalogo-geo.js";
import { obtenerPaises, obtenerCiudades } from "../servicios/geo-servicio.js";
import { ServiceError } from "../../../lib/service-error.js";

test("listarPaises: catálogo no vacío con iso/flag/cityCount", () => {
  const countries = listarPaises();
  assert.ok(Array.isArray(countries));
  assert.ok(countries.length > 5);
  const mx = countries.find((c) => c.name === "México");
  assert.ok(mx);
  assert.equal(mx.iso, "MX");
  assert.equal(typeof mx.flag, "string");
  assert.ok(mx.cityCount > 0);
});

test("buscarPais: por nombre e ISO", () => {
  assert.equal(buscarPais("México"), "México");
  assert.equal(buscarPais("mx"), "México");
  assert.equal(buscarPais("  México  "), "México");
  assert.equal(buscarPais(""), null);
  assert.equal(buscarPais("zz-no-existe-xyz"), null);
});

test("listarCiudades: México incluye ciudades; país inválido null", () => {
  const data = listarCiudades("México");
  assert.equal(data.country, "México");
  assert.ok(Array.isArray(data.cities));
  assert.ok(data.cities.length > 0);
  assert.equal(listarCiudades("no-existe-xyz"), null);
});

test("geo-servicio obtenerPaises delega al catálogo", () => {
  assert.deepEqual(obtenerPaises(), listarPaises());
});

test("geo-servicio obtenerCiudades lanza 404 si país no existe", () => {
  assert.throws(() => obtenerCiudades("no-existe-xyz"), (err) => {
    assert.ok(err instanceof ServiceError);
    assert.equal(err.status, 404);
    return true;
  });
});
