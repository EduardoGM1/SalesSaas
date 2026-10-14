/**
 * Caracterización moneda / FX (debe pasar antes y después del move a modulos/moneda).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizeUsdToMxnRate } from "./normalizar-tasa-usd-mxn.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_SRC = path.resolve(HERE, "../../..");
const ENTRY = path.join(HERE, "../servicios/moneda-servicio.ts");
const OUT = path.join(HERE, ".tmp-moneda-service.mjs");

async function loadMoneda() {
  execSync(
    [
      "npx --yes esbuild",
      `"${ENTRY.replace(/\\/g, "/")}"`,
      "--bundle",
      "--format=esm",
      "--platform=neutral",
      `--outfile="${OUT.replace(/\\/g, "/")}"`,
      `--alias:@=${WEB_SRC.replace(/\\/g, "/")}`,
      "--log-level=error",
    ].join(" "),
    { stdio: "pipe" },
  );
  return import(pathToFileURL(OUT).href + `?t=${Date.now()}`);
}

function near(a, b, eps = 1e-9) {
  return Math.abs(Number(a) - Number(b)) <= eps;
}

test("normalizeUsdToMxnRate: 1, 0, abc, null, ausente → undefined; 17.5 → 17.5", () => {
  assert.equal(normalizeUsdToMxnRate(1), undefined);
  assert.equal(normalizeUsdToMxnRate(0), undefined);
  assert.equal(normalizeUsdToMxnRate("abc"), undefined);
  assert.equal(normalizeUsdToMxnRate(null), undefined);
  assert.equal(normalizeUsdToMxnRate(undefined), undefined);
  assert.equal(normalizeUsdToMxnRate(""), undefined);
  assert.equal(normalizeUsdToMxnRate(17.5), 17.5);
});

test("resolveUsdToMxnRate / getMonedaContext / convertir / isUnusual (USD MXN CAD EUR)", async () => {
  const mod = await loadMoneda();
  try {
    const {
      resolveUsdToMxnRate,
      convertir,
      getMonedaContext,
      isUnusualUsdToMxnRate,
      unusualUsdToMxnRateMessage,
    } = mod;

    assert.equal(resolveUsdToMxnRate({ usdToMxnRate: 1 }), 18);
    assert.equal(resolveUsdToMxnRate({ usdToMxnRate: 0 }), 18);
    assert.equal(resolveUsdToMxnRate({ usdToMxnRate: "abc" }), 18);
    assert.equal(resolveUsdToMxnRate({ usdToMxnRate: null }), 18);
    assert.equal(resolveUsdToMxnRate({}), 18);
    assert.equal(resolveUsdToMxnRate({ usdToMxnRate: 17.5 }), 17.5);
    assert.equal(resolveUsdToMxnRate({ currency: "MXN", exchangeRate: 16.5 }), 16.5);
    assert.equal(resolveUsdToMxnRate({ currency: "USD", exchangeRate: 1 }), 18);

    const ctxUsd = getMonedaContext({ currency: "USD", usdToMxnRate: 18 });
    assert.equal(ctxUsd.operationalFromUsd, 1);
    assert.equal(convertir(100, "USD", "USD", ctxUsd), 100);
    assert.equal(convertir(100, "USD", "MXN", ctxUsd), 1800);
    assert.ok(near(convertir(1800, "MXN", "USD", ctxUsd), 100));
    assert.ok(near(convertir(4000, "MXN", "USD", ctxUsd), 4000 / 18));

    const ctxMxn = getMonedaContext({ currency: "MXN", exchangeRate: 18, usdToMxnRate: 18 });
    assert.ok(near(convertir(100, "USD", "MXN", ctxMxn), 1800));
    assert.ok(near(convertir(1800, "MXN", "MXN", ctxMxn), 1800));

    const ctxCad = getMonedaContext({ currency: "CAD", exchangeRate: 1.35, usdToMxnRate: 18 });
    assert.ok(near(convertir(100, "USD", "CAD", ctxCad), 135));
    assert.ok(near(convertir(135, "CAD", "USD", ctxCad), 100));
    const ctxEur = getMonedaContext({ currency: "EUR", exchangeRate: 0.92, usdToMxnRate: 18 });
    assert.ok(near(convertir(100, "USD", "EUR", ctxEur), 92));
    assert.ok(near(convertir(92, "EUR", "USD", ctxEur), 100));

    assert.equal(isUnusualUsdToMxnRate(1), true);
    assert.equal(isUnusualUsdToMxnRate(18), false);
    assert.match(unusualUsdToMxnRateMessage(1), /1 USD = 1 MXN/);
  } finally {
    if (fs.existsSync(OUT)) fs.unlinkSync(OUT);
  }
});
