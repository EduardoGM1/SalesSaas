/**
 * Golden master — dominio agenda (descansos).
 * Debe pasar idéntico antes y después del move a modulos/agenda.
 *
 * Importa por fachada-node (post-move). Mientras el move no exista, el runner
 * resuelve el path legacy vía esbuild alias (igual que metas-calculo.test).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = resolve(HERE, "../../..");
const FACHADA = resolve(HERE, "../fachada-node.js");
const LEGACY = resolve(WEB_SRC, "lib/calculations/calendar-descansos.js");
const OUT = resolve(HERE, ".tmp-agenda-descansos.mjs");

async function load() {
  const entry = fs.existsSync(FACHADA) ? FACHADA : LEGACY;
  const aliasRoot = WEB_SRC.replace(/\\/g, "/");
  execSync(
    [
      "npx --yes esbuild",
      `"${entry.replace(/\\/g, "/")}"`,
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

function api(mod) {
  const contar = mod.contarDiasDescanso || mod.countDescansoDays;
  const esDia = mod.esDiaDescanso || mod.isDescansoDay;
  assert.equal(typeof contar, "function");
  assert.equal(typeof esDia, "function");
  return { contar, esDia };
}

test("vacío / null / sin days → 0 descansos", async () => {
  const { contar, esDia } = api(await load());
  assert.equal(contar(undefined), 0);
  assert.equal(contar(null), 0);
  assert.equal(contar({}), 0);
  assert.equal(contar({ days: {} }), 0);
  assert.equal(esDia({ days: {} }, 1), false);
  assert.equal(esDia(undefined, 15), false);
});

test("un día con t=descanso cuenta; otros tipos no", async () => {
  const { contar, esDia } = api(await load());
  const data = {
    days: {
      1: [{ t: "descanso" }],
      2: [{ t: "nota" }],
      3: [{ t: "follow" }],
      4: [{ t: "venta" }],
      5: [{ t: "nota", kind: "no-tour" }],
    },
  };
  assert.equal(contar(data), 1);
  assert.equal(esDia(data, 1), true);
  assert.equal(esDia(data, 2), false);
  assert.equal(esDia(data, 5), false);
});

test("varios descansos el mismo día → un día (no multiplica)", async () => {
  const { contar, esDia } = api(await load());
  const data = {
    days: {
      10: [{ t: "descanso" }, { t: "descanso" }, { t: "nota" }],
    },
  };
  assert.equal(contar(data), 1);
  assert.equal(esDia(data, 10), true);
});

test("fin de semana (sáb/dom) con y sin descanso — solo mira t", async () => {
  // enero 2026: día 3 = sábado, 4 = domingo (calendario civil; TZ no afecta la clave de día)
  const { contar, esDia } = api(await load());
  const data = {
    days: {
      3: [{ t: "descanso" }],
      4: [{ t: "nota" }],
    },
  };
  assert.equal(contar(data), 1);
  assert.equal(esDia(data, 3), true);
  assert.equal(esDia(data, 4), false);
});

test("borde de mes: día 31 y mes corto (feb no bisiesto)", async () => {
  const { contar, esDia } = api(await load());
  const ene = { days: { 31: [{ t: "descanso" }], 30: [{ t: "follow" }] } };
  assert.equal(contar(ene), 1);
  assert.equal(esDia(ene, 31), true);
  const feb = { days: { 28: [{ t: "descanso" }], 29: [{ t: "descanso" }] } };
  // la clave 29 puede existir en el blob aunque el mes no tenga ese día civil
  assert.equal(contar(feb), 2);
});

test("cruce año: dic 31 + ene 1 en blobs distintos (independientes)", async () => {
  const { contar } = api(await load());
  const dic = { days: { 31: [{ t: "descanso" }] } };
  const ene = { days: { 1: [{ t: "descanso" }] } };
  assert.equal(contar(dic), 1);
  assert.equal(contar(ene), 1);
});

test("America/Cancun: misma clave de día que UTC para este dominio (sin Date)", async () => {
  // El dominio no usa Date ni TZ: solo Object.keys de days. Snapshot estable.
  const { contar, esDia } = api(await load());
  const data = {
    days: {
      1: [{ t: "descanso", note: "Año Nuevo Cancún" }],
      15: [{ t: "venta", status: "venta" }],
      16: [{ t: "nota", kind: "no-tour" }],
    },
  };
  assert.equal(contar(data), 1);
  assert.equal(esDia(data, 1), true);
  assert.equal(esDia(data, 16), false);
  assert.deepEqual(
    Object.keys(data.days).map(Number).sort((a, b) => a - b),
    [1, 15, 16],
  );
});

test("golden snapshot: mes sintético con 3 descansos dispersos", async () => {
  const { contar, esDia } = api(await load());
  const data = {
    days: {
      2: [{ t: "descanso" }],
      9: [{ t: "nota" }, { t: "follow" }],
      16: [{ t: "descanso" }],
      23: [{ t: "venta" }],
      30: [{ t: "descanso" }, { t: "nota", kind: "no-tour" }],
    },
  };
  assert.equal(contar(data), 3);
  assert.deepEqual(
    [1, 2, 9, 16, 23, 30].map((d) => esDia(data, d)),
    [false, true, false, true, false, true],
  );
});
