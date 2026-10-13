import assert from "node:assert/strict";
import test from "node:test";
import { isSupportedCurrency, getUsdExchangeRate } from "./exchange-rates.js";

test("isSupportedCurrency: USD MXN CAD EUR", () => {
  assert.equal(isSupportedCurrency("USD"), true);
  assert.equal(isSupportedCurrency("mxn"), true);
  assert.equal(isSupportedCurrency("CAD"), true);
  assert.equal(isSupportedCurrency("EUR"), true);
  assert.equal(isSupportedCurrency("GBP"), false);
  assert.equal(isSupportedCurrency(""), false);
});

test("getUsdExchangeRate(USD): fijo 1 sin red", async () => {
  const r = await getUsdExchangeRate("USD");
  assert.equal(r.base, "USD");
  assert.equal(r.to, "USD");
  assert.equal(r.rate, 1);
  assert.equal(r.source, "fixed");
  assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
});

test("getUsdExchangeRate: moneda no soportada", async () => {
  await assert.rejects(() => getUsdExchangeRate("GBP"), /no soportada/i);
});

test("getUsdExchangeRate(MXN): respuesta sintética vía mock fetch", async () => {
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
    const r = await getUsdExchangeRate("MXN");
    assert.equal(r.to, "MXN");
    assert.equal(r.rate, 17.5);
    assert.equal(r.date, "2026-01-15");
    assert.equal(r.source, "frankfurter");
    assert.equal(calls, 1);
    // Segunda llamada debe usar caché (mismo proceso)
    const r2 = await getUsdExchangeRate("MXN");
    assert.equal(r2.rate, 17.5);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
