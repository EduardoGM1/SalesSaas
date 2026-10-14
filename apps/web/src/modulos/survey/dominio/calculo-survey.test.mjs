/**
 * Caracterización cálculos survey (módulo 5a).
 * Claves JSON del payload y forma de SurveyCalcResult no se renombran.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = resolve(HERE, "../../..");
const MOD_ENTRY = resolve(HERE, "calculo-survey.ts");
const OUT = resolve(HERE, ".tmp-survey-calculo.mjs");

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

test("calcularSurvey / computeSurvey: totales históricos sin año", async () => {
  const mod = await load();
  const fn = mod.calcularSurvey || mod.computeSurvey;
  const data = {
    sh1y: "",
    sh1a: "2000",
    sh2y: "",
    sh2a: "3000",
    sh3y: "",
    sh3a: "",
  };
  const result = fn(data);
  assert.equal(result.hist.spend, 5000);
  assert.equal(result.hist.avg, 2500);
  assert.equal(result.hist.dp, 2500);
  assert.ok(Math.abs(result.hist.mi - 2500 / 12) < 0.01);
  const cleared = fn({ ...data, sh2a: "" });
  assert.equal(cleared.hist.spend, 2000);
});

test("calcularSurvey: hotel vs paquete (split hpct)", async () => {
  const mod = await load();
  const fn = mod.calcularSurvey;
  const base = { total: "10000", hpct: "70", nights: "7" };
  const hotel = fn(base, "hotel");
  assert.equal(hotel.current.dp, 10000);
  assert.equal(hotel.split.hpct, 70);
  assert.equal(hotel.split.hval, 7000);
  const paquete = fn(base, "paquete");
  assert.equal(paquete.current.dp, 7000);
  assert.ok(Math.abs(paquete.current.mi - 7000 / 12) < 0.01);
});

test("encuestaTieneDatos / surveyHasData", async () => {
  const mod = await load();
  const has = mod.encuestaTieneDatos || mod.surveyHasData;
  assert.equal(has({}), false);
  assert.equal(has({ total: "" }), false);
  assert.equal(has({ total: "1" }), true);
});

test.after(() => {
  try {
    fs.unlinkSync(OUT);
  } catch {
    /* ignore */
  }
});
