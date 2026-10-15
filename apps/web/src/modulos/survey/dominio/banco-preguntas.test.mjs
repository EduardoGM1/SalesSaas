/**
 * Caracterización banco/resolución Discovery (5b.5) — ANTES del movimiento.
 * Casos sintéticos + datos legacy (texto ES → claves). No renombra keys/ids/disc_json.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = resolve(HERE, "../../..");
const OUT = resolve(HERE, ".tmp-banco-preguntas.mjs");

const LEGACY = {
  resolve: resolve(WEB_SRC, "lib/survey/resolve-survey-questions.js"),
  fallback: resolve(WEB_SRC, "lib/survey/fallback-bank.js"),
  legacyMap: resolve(WEB_SRC, "lib/survey/legacy-option-map.js"),
  storage: resolve(WEB_SRC, "lib/survey/discovery-storage.js"),
};
const MOD = {
  resolve: resolve(HERE, "resolve-survey-questions.js"),
  fallback: resolve(HERE, "fallback-bank.js"),
  legacyMap: resolve(HERE, "legacy-option-map.js"),
  storage: resolve(HERE, "discovery-storage.js"),
};

function pick(key) {
  return existsSync(MOD[key]) ? MOD[key] : LEGACY[key];
}

async function loadEntry(absPath) {
  execSync(
    [
      "npx --yes esbuild",
      `"${absPath.replace(/\\/g, "/")}"`,
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

test.after(() => {
  try {
    unlinkSync(OUT);
  } catch {
    /* ignore */
  }
});

test("legacy-option-map: entradas históricas p1/hasTs/memb → claves estables", async () => {
  const mod = await loadEntry(pick("legacyMap"));
  const m = mod.LEGACY_OPTION_TEXT_TO_KEY;
  assert.equal(m["p1::Descansar y desconectarse"], "rest_disconnect");
  assert.equal(m["p1::Pasar tiempo en familia"], "family_time");
  assert.equal(m["hasTs::Sí"], "yes");
  assert.equal(m["hasTs::Tuvo anteriormente"], "had_before");
  assert.equal(m["memb::Semana fija"], "fixed_week");
  assert.equal(m["memb::Puntos"], "points");
  assert.ok(Object.keys(m).length > 100, "mapa legacy no vacío");
});

test("fallback-bank: filas con ids fallback-* y claves canónicas", async () => {
  const mod = await loadEntry(pick("fallback"));
  const rows = mod.buildFallbackBankRows();
  assert.ok(rows.length >= 20, `esperado ≥20 filas, got ${rows.length}`);
  const p1 = rows.find((r) => r.clave === "p1");
  assert.ok(p1, "p1 en banco fallback");
  assert.equal(p1.id, "fallback-p1");
  assert.equal(p1.seccion, "motivaciones");
  assert.ok(p1.opciones.includes("rest_disconnect"));
  const hasTs = rows.find((r) => r.clave === "hasTs");
  assert.ok(hasTs);
  assert.equal(hasTs.bloque, "has_ts");
  assert.deepEqual(hasTs.opciones.slice(0, 2), ["yes", "no"]);
});

test("mergeSurveyQuestions: override desactiva y reordena; opciones_override custom", async () => {
  const mod = await loadEntry(pick("resolve"));
  const bankRows = (await loadEntry(pick("fallback"))).buildFallbackBankRows();
  const p1 = bankRows.find((r) => r.clave === "p1");
  const merged = mod.mergeSurveyQuestions(
    bankRows,
    [
      {
        pregunta_id: p1.id,
        activa: false,
        orden: 999,
        texto_override: "Texto custom",
        opciones_override: [
          { key: "rest_disconnect", label: "Descanso custom" },
          { key: "custom_abc123", label: "Opción vendedor" },
        ],
      },
    ],
    { includeInactive: true },
  );
  const row = merged.find((r) => r.clave === "p1");
  assert.equal(row.activa, false);
  assert.equal(row.orden, 999);
  assert.equal(row.texto_override, "Texto custom");
  assert.ok(row.opciones.includes("rest_disconnect"));
  assert.ok(row.opciones.includes("custom_abc123"));
  assert.equal(row.optionLabels.rest_disconnect, "Descanso custom");
  assert.equal(row.optionLabels.custom_abc123, "Opción vendedor");

  const activeOnly = mod.mergeSurveyQuestions(bankRows, [
    { pregunta_id: p1.id, activa: false, orden: 1 },
  ]);
  assert.ok(!activeOnly.some((r) => r.clave === "p1"), "inactiva filtrada por defecto");
});

test("groupResolvedQuestions / fallbackGroupedQuestions: forma ChipQuestion", async () => {
  const mod = await loadEntry(pick("resolve"));
  const g = mod.fallbackGroupedQuestions();
  assert.ok(g.motivacionesBefore.length >= 1);
  assert.ok(g.styleQuestions.length >= 1);
  assert.ok(g.timeshareQuestions.length >= 1);
  assert.ok(g.hasTsQuestion);
  assert.equal(g.hasTsQuestion.id, "hasTs");
  const q = g.motivacionesBefore[0];
  assert.ok(q.titleKey.startsWith("survey.disc.q."));
  assert.ok(Array.isArray(q.optionKeys));
  assert.ok(g.progressIds.includes("p1"));
});

test("discovery-storage: normalizeSelectedKeys / normalizeDiscovery con legacy ES", async () => {
  const mod = await loadEntry(pick("storage"));
  assert.deepEqual(mod.normalizeSelectedKeys("p1", ["Descansar y desconectarse", "family_time"]), [
    "rest_disconnect",
    "family_time",
  ]);
  assert.deepEqual(mod.normalizeOpcionesArray("p1", ["Descansar y desconectarse", "family_time"]), [
    "rest_disconnect",
    "family_time",
  ]);

  const disc = mod.normalizeDiscovery({
    answers: { p1: ["Pasar tiempo en familia"] },
    contexts: {},
    hasTs: "Sí",
    memberships: [{ paysMaint: "Sí", paidFull: "No", type: "Semana fija", company: "X" }],
  });
  assert.deepEqual(disc.answers.p1, ["family_time"]);
  assert.equal(disc.hasTs, "yes");
  assert.equal(disc.memberships[0].paysMaint, "yes");
  assert.equal(disc.memberships[0].paidFull, "no");
  assert.equal(disc.memberships[0].type, "fixed_week");

  const round = mod.parseDiscovery(mod.serializeDiscovery(disc));
  assert.deepEqual(round.answers.p1, ["family_time"]);
  assert.equal(round.hasTs, "yes");
});
