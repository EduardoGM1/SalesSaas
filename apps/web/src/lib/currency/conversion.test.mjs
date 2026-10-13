import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizeUsdToMxnRate } from "./usd-to-mxn-normalize.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_SRC = path.resolve(HERE, "../..");
const ENTRY = path.join(HERE, "moneda-service.ts");
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

test("normalizeUsdToMxnRate: ≤1 o inválido → undefined", () => {
  assert.equal(normalizeUsdToMxnRate(1), undefined);
  assert.equal(normalizeUsdToMxnRate(0.5), undefined);
  assert.equal(normalizeUsdToMxnRate("x"), undefined);
  assert.equal(normalizeUsdToMxnRate(null), undefined);
  assert.equal(normalizeUsdToMxnRate(17.2), 17.2);
});

test("resolveUsdToMxnRate / convertir / isUnusualUsdToMxnRate (sintético)", async () => {
  const mod = await loadMoneda();
  try {
    const { resolveUsdToMxnRate, convertir, getMonedaContext, isUnusualUsdToMxnRate } = mod;
    assert.equal(resolveUsdToMxnRate({ usdToMxnRate: 17 }), 17);
    assert.equal(resolveUsdToMxnRate({ currency: "MXN", exchangeRate: 16.5 }), 16.5);
    assert.equal(resolveUsdToMxnRate({ currency: "USD", exchangeRate: 1 }), 18);
    assert.equal(resolveUsdToMxnRate({}), 18);

    const ctx = getMonedaContext({ currency: "USD", usdToMxnRate: 20 });
    assert.equal(convertir(100, "USD", "USD", ctx), 100);
    assert.equal(convertir(100, "USD", "MXN", ctx), 2000);
    assert.equal(convertir(2000, "MXN", "USD", ctx), 100);

    const ctxCad = getMonedaContext({ currency: "CAD", exchangeRate: 1.35, usdToMxnRate: 18 });
    assert.ok(Math.abs(convertir(100, "USD", "CAD", ctxCad) - 135) < 1e-9);

    assert.equal(isUnusualUsdToMxnRate(1), true);
    assert.equal(isUnusualUsdToMxnRate(18), false);
  } finally {
    if (fs.existsSync(OUT)) fs.unlinkSync(OUT);
  }
});
