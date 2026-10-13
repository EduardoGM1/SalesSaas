import assert from "node:assert/strict";
import test from "node:test";
import {
  armarResultadoUsdFijo,
  esMonedaSoportada,
  interpretarRespuestaProveedor,
  leerCache,
  escribirCache,
} from "./tipo-cambio-nucleo.js";
import { obtenerTipoCambioUsd } from "../servicios/tipo-cambio-servicio.js";

test("esMonedaSoportada: USD MXN CAD EUR", () => {
  assert.equal(esMonedaSoportada("USD"), true);
  assert.equal(esMonedaSoportada("mxn"), true);
  assert.equal(esMonedaSoportada("CAD"), true);
  assert.equal(esMonedaSoportada("EUR"), true);
  assert.equal(esMonedaSoportada("GBP"), false);
  assert.equal(esMonedaSoportada(""), false);
});

test("armarResultadoUsdFijo / interpretarRespuestaProveedor (puro)", () => {
  const fijo = armarResultadoUsdFijo("2026-01-15");
  assert.equal(fijo.rate, 1);
  assert.equal(fijo.source, "fixed");
  const parsed = interpretarRespuestaProveedor({ date: "2026-01-15", rates: { MXN: 17.5 } }, "MXN");
  assert.equal(parsed.rate, 17.5);
  assert.throws(() => interpretarRespuestaProveedor({ rates: { MXN: 0 } }, "MXN"));
});

test("obtenerTipoCambioUsd(USD): fijo 1 sin red", async () => {
  const r = await obtenerTipoCambioUsd("USD");
  assert.equal(r.base, "USD");
  assert.equal(r.to, "USD");
  assert.equal(r.rate, 1);
  assert.equal(r.source, "fixed");
  assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
});

test("obtenerTipoCambioUsd: moneda no soportada", async () => {
  await assert.rejects(() => obtenerTipoCambioUsd("GBP"), /no soportada/i);
});

test("obtenerTipoCambioUsd(MXN): respuesta sintética vía mock fetch", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls += 1;
    assert.match(String(url), /symbols=MXN/);
    return {
      ok: true,
      async json() {
        return { date: "2026-01-15", rates: { MXN: 17.5 } };
      },
    };
  };
  try {
    const r = await obtenerTipoCambioUsd("MXN");
    assert.equal(r.to, "MXN");
    assert.equal(r.rate, 17.5);
    assert.equal(r.date, "2026-01-15");
    assert.equal(r.source, "frankfurter");
    assert.equal(calls, 1);
    const r2 = await obtenerTipoCambioUsd("MXN");
    assert.equal(r2.rate, 17.5);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("leerCache / escribirCache", () => {
  const cache = new Map();
  assert.equal(leerCache(cache, "EUR"), null);
  escribirCache(cache, "EUR", { rate: 0.9, date: "2026-01-01", source: "t" }, 1000);
  const hit = leerCache(cache, "EUR", 1000 + 1000);
  assert.equal(hit.rate, 0.9);
});
