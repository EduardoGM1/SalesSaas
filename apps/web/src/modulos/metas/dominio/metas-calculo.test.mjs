/**
 * Caracterización cálculos de metas (web).
 * Bundléa kpis-metas (importa descansos vía fachada `@/modulos/agenda`).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = resolve(HERE, "../../..");
const MOD_ENTRY = resolve(HERE, "kpis-metas.ts");
const OUT = resolve(HERE, ".tmp-metas-calculo.mjs");

async function loadCalcs() {
  const aliasRoot = WEB_SRC.replace(/\\/g, "/");
  execSync(
    [
      "npx --yes esbuild",
      `"${MOD_ENTRY.replace(/\\/g, "/")}"`,
      "--bundle",
      "--format=esm",
      "--platform=neutral",
      `--outfile="${OUT.replace(/\\/g, "/")}"`,
      `--alias:@=${aliasRoot}`,
      "--log-level=error",
    ].join(" "),
    { stdio: "pipe" },
  );
  return import(pathToFileURL(OUT).href + `?t=${Date.now()}`);
}

function emptyMonth() {
  return { days: {} };
}

test("normalizeGoal / normalizarMeta: ausente y parcial → ceros", async () => {
  const mod = await loadCalcs();
  const fn = mod.normalizarMeta || mod.normalizeGoal;
  assert.deepEqual(fn(undefined), { vol: 0, tours: 0, ventas: 0, dias: 0, desc: 0 });
  assert.deepEqual(fn({ vol: "100", tours: 2 }), { vol: 100, tours: 2, ventas: 0, dias: 0, desc: 0 });
});

test("computeMetasKpis / calcularKpisMetas: sintético sin descansos", async () => {
  const mod = await loadCalcs();
  const fn = mod.calcularKpisMetas || mod.computeMetasKpis;
  const k = fn(2026, 0, emptyMonth(), 400000, 20, 8);
  // enero 2026 = 31 días
  assert.equal(k.dim, 31);
  assert.equal(k.descDays, 0);
  assert.equal(k.trabajados, 31);
  assert.equal(k.vprom, 400000 / 8);
  assert.equal(k.efic, 400000 / 20);
  assert.equal(k.cierre, (8 / 20) * 100);
  assert.ok(Math.abs(k.prod - 400000 / 31) < 1e-9);
});

test("computeMetasKpis: un día descanso reduce trabajados", async () => {
  const mod = await loadCalcs();
  const fn = mod.calcularKpisMetas || mod.computeMetasKpis;
  const data = { days: { 1: [{ t: "descanso" }] } };
  const k = fn(2026, 0, data, 310000, 10, 5);
  assert.equal(k.descDays, 1);
  assert.equal(k.trabajados, 30);
  assert.ok(Math.abs(k.prod - 310000 / 30) < 1e-9);
});
