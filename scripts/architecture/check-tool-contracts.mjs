/**
 * Contratos sintéticos de tool data por herramienta.
 * - survey, vacaciones, worksheet (RH) → forma de tool_calculations.data
 * - money-box → forma settings.moneyBoxConfig (no tool_calculations hoy)
 *
 * Sin datos reales / PII.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bodyToToolUpsert, sanitizeTool } from "../../packages/shared/src/api/validators.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FIXTURES = path.join(ROOT, "scripts/architecture/fixtures/tool-data");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8"));
}

function assertPlainObject(data, label) {
  assert(data && typeof data === "object" && !Array.isArray(data), `${label}: data debe ser objeto`);
}

function checkSurvey(fixture) {
  const { data } = fixture;
  assertPlainObject(data, "survey");
  assert(typeof data.disc_json === "string", "survey.disc_json string");
  const disc = JSON.parse(data.disc_json);
  assert(disc && typeof disc.answers === "object", "survey.disc_json.answers");
  assert(typeof data.stype === "string" || data.stype == null, "survey.stype");
  const row = bodyToToolUpsert(
    { tool: "survey", prospect_id: "libre", data },
    "00000000-0000-4000-8000-000000000001",
    null,
  );
  assert(row && row.tool === "survey", "survey upsert row");
  assert(sanitizeTool("survey") === "survey", "sanitizeTool survey");
}

function checkVacaciones(fixture) {
  const { data } = fixture;
  assertPlainObject(data, "vacaciones");
  for (const k of ["vv", "vc", "va", "vi"]) {
    assert(k in data, `vacaciones.${k} requerido en fixture`);
  }
  const row = bodyToToolUpsert(
    { tool: "vacaciones", prospect_id: "libre", data },
    "00000000-0000-4000-8000-000000000001",
    null,
  );
  assert(row && row.tool === "vacaciones", "vacaciones upsert row");
}

function checkWorksheetRh(fixture) {
  const { data } = fixture;
  assertPlainObject(data, "worksheet-rh");
  assert(data.rh === "1" || data.rh === true, "worksheet rh flag");
  assert(typeof data.rhTab === "string", "worksheet rhTab");
  assert(typeof data.rhForm_json === "string", "worksheet rhForm_json");
  const form = JSON.parse(data.rhForm_json);
  assert(form && typeof form === "object", "rhForm parseable");
  assert(typeof form.holiday_credits === "string", "rhForm.holiday_credits");
  assert(Array.isArray(form.valores), "rhForm.valores");
  const row = bodyToToolUpsert(
    { tool: "worksheet", prospect_id: "libre", data },
    "00000000-0000-4000-8000-000000000001",
    null,
  );
  assert(row && row.tool === "worksheet", "worksheet upsert row");
}

function checkMoneyBox(fixture) {
  const { data } = fixture;
  assertPlainObject(data, "money-box");
  for (const k of [
    "minDownPct",
    "maxDownPct",
    "fcCents",
    "ffCents",
    "maxSaleCents",
    "roundStepCents",
    "pctStep",
    "minDrop",
  ]) {
    assert(typeof data[k] === "number" && Number.isFinite(data[k]), `money-box.${k} number`);
  }
  assert(data.minDownPct <= data.maxDownPct, "money-box minDownPct <= maxDownPct");
  assert(data.scenario && typeof data.scenario.mode === "string", "money-box.scenario.mode");
  // Confirmado: money-box no es tool_calculations slug hoy
  assert(sanitizeTool("money-box") === null, "money-box no es sanitizeTool tool_calculations");
  assert(fixture._meta?.storage?.includes("settings"), "money-box storage documentado en settings");
}

function main() {
  const errors = [];
  const checks = [
    ["survey.json", checkSurvey],
    ["vacaciones.json", checkVacaciones],
    ["worksheet-rh.json", checkWorksheetRh],
    ["money-box.json", checkMoneyBox],
  ];

  for (const [file, fn] of checks) {
    try {
      fn(load(file));
      console.log(`  ✓ ${file}`);
    } catch (err) {
      errors.push(`${file}: ${err.message}`);
      console.error(`  ✗ ${file}: ${err.message}`);
    }
  }

  if (errors.length) {
    console.error("✗ Contratos de tool data FALLARON");
    process.exitCode = 1;
    return;
  }
  console.log("✓ Contratos tool_calculations.data / money-box OK (4 fixtures sintéticos)");
}

main();
