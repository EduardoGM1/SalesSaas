/**
 * Caracterización cálculos vacaciones (antes/después del move a modulos/vacaciones).
 * Claves JSON del payload (vv, vc, va, vi) y resultados (ga, cf, ts, tc, …) no se renombran.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = resolve(HERE, "../../..");
const MOD_ENTRY = resolve(HERE, "calculo-vacaciones.ts");
const OUT = resolve(HERE, ".tmp-vacaciones-calculo.mjs");

async function load() {
  execSync(
    [
      "npx --yes esbuild",
      `"${MOD_ENTRY.replace(/\\/g, "/")}"`,
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

function near(a, b, eps = 1e-6) {
  return Math.abs(Number(a) - Number(b)) <= eps;
}

test("calcularVacaciones: sin inflación", async () => {
  const mod = await load();
  const r = mod.calcularVacaciones({ vv: "2", vc: "5000", va: "10", vi: "0" });
  assert.equal(r.viajes, 2);
  assert.equal(r.costo, 5000);
  assert.equal(r.anios, 10);
  assert.equal(r.inf, 0);
  assert.equal(r.ga, 10000);
  assert.equal(r.ts, 100000);
  assert.equal(r.tc, 100000);
  assert.equal(r.cf, 10000);
  assert.equal(r.futAno, new Date().getFullYear() + 10);
});

test("calcularVacaciones: con inflación 8%", async () => {
  const mod = await load();
  const r = mod.calcularVacaciones({ vv: 2, vc: 5000, va: 10, vi: 8 });
  assert.equal(r.ga, 10000);
  assert.ok(near(r.inf, 0.08));
  const expectedCf = 10000 * Math.pow(1.08, 10);
  const expectedTc = 10000 * ((Math.pow(1.08, 10) - 1) / 0.08);
  assert.ok(near(r.cf, expectedCf), `cf=${r.cf} expected ${expectedCf}`);
  assert.ok(near(r.tc, expectedTc), `tc=${r.tc} expected ${expectedTc}`);
  assert.equal(r.ts, 100000);
});

test("construirSerieAcumuladaVacaciones: longitud y extremos", async () => {
  const mod = await load();
  const start = 2020;
  const series = mod.construirSerieAcumuladaVacaciones(
    { vv: "1", vc: "1000", va: "5", vi: "0" },
    start,
  );
  assert.equal(series.length, 6); // 0..5
  assert.equal(series[0].year, start);
  assert.equal(series[0].withoutInflation, 0);
  assert.equal(series[0].withInflation, 0);
  assert.equal(series[5].year, start + 5);
  assert.equal(series[5].withoutInflation, 5000);
  assert.equal(series[5].withInflation, 5000);
});

test("serie con inflación alinea tc en el último punto", async () => {
  const mod = await load();
  const input = { vv: "2", vc: "3000", va: "4", vi: "5" };
  const r = mod.calcularVacaciones(input);
  const series = mod.construirSerieAcumuladaVacaciones(input, 2030);
  assert.ok(near(series[series.length - 1].withInflation, r.tc));
  assert.ok(near(series[series.length - 1].withoutInflation, r.ts));
});

test.after(() => {
  try {
    fs.unlinkSync(OUT);
  } catch {
    /* ignore */
  }
});
