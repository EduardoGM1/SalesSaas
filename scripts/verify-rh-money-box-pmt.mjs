#!/usr/bin/env node
/**
 * Smoke Money Box RH — mensualidades desde Catálogo RH, no worksheetConfig.
 * Criterios:
 *  1) Panel no usa WS_DEFAULTS / wo1m; sí termsFromRhFinanciamiento
 *  2) Mensualidad de la matriz = calcularMensualidad (Datos Financiamiento)
 *     para el mismo Enganche% + Plazo + Nacionalidad
 *  3) Combinación ausente en catálogo → N/A (null), sin fallback personal
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  calcularMensualidad,
  lookupFinanciamientoPlazo,
} from "../packages/shared/src/calculations/royal-holiday.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "scripts", ".tmp-rh-money-box-pmt.mjs");
const entry = path.join(root, "apps/web/src/lib/calculations/money-box.ts");
const panelPath = path.join(root, "apps/web/src/components/calculators/worksheet-rh-money-box-panel.jsx");

let failed = 0;
function ok(msg) { console.log(`✓ ${msg}`); }
function fail(msg) { failed += 1; console.error(`✗ ${msg}`); }

const panelSrc = fs.readFileSync(panelPath, "utf8");
const forbidden = ["WS_DEFAULTS", "wo1m", "wo1r", "termsFromWorksheetConfig"];
for (const token of forbidden) {
  if (panelSrc.includes(token)) fail(`panel contiene "${token}" (config personal)`);
  else ok(`panel NO usa "${token}"`);
}
if (!panelSrc.includes("termsFromRhFinanciamiento")) fail("panel debe usar termsFromRhFinanciamiento");
else ok("panel usa termsFromRhFinanciamiento");
if (!panelSrc.includes("getMoneyBoxConfig")) fail("panel debe seguir leyendo restricciones via getMoneyBoxConfig");
else ok("panel usa royalHolidayApi.getMoneyBoxConfig (restricciones)");
if (!panelSrc.includes("embedded")) fail("panel debe montar MoneyBoxCalculator embedded");
else ok("panel monta MoneyBoxCalculator embedded");

const CATALOGO = [
  { enganche_pct: 25, plazo_meses: 60, nacionalidad: "mexicano", tasa_interes: 16.99, factor_mensual: 0.024531 },
  { enganche_pct: 25, plazo_meses: 48, nacionalidad: "mexicano", tasa_interes: 14.99, factor_mensual: 0.0278 },
  { enganche_pct: 35, plazo_meses: 60, nacionalidad: "mexicano", tasa_interes: 12.99, factor_mensual: 0.022701 },
  { enganche_pct: 35, plazo_meses: 48, nacionalidad: "mexicano", tasa_interes: 10.9, factor_mensual: 0.0255 },
  { enganche_pct: 45, plazo_meses: 12, nacionalidad: "mexicano", tasa_interes: 0, factor_mensual: 1 / 12 },
  { enganche_pct: 25, plazo_meses: 60, nacionalidad: "resto", tasa_interes: 18, factor_mensual: 0.03 },
];

try {
  execSync(
    [
      "npx --yes esbuild",
      `"${entry}"`,
      "--bundle",
      "--format=esm",
      "--platform=neutral",
      `--outfile="${out}"`,
      `--alias:@=${path.join(root, "apps/web/src").replace(/\\/g, "/")}`,
      `--alias:@salesapp/shared=${path.join(root, "packages/shared/src").replace(/\\/g, "/")}`,
    ].join(" "),
    { cwd: root, stdio: "pipe" },
  );

  const {
    termsFromRhFinanciamiento,
    termsFromWorksheetConfig,
    defaultPolicyConfig,
    toCents,
    mensualidadPara,
    generateDownProposals,
  } = await import(pathToFileURL(out).href);

  const wsTerms = termsFromWorksheetConfig({
    wo1m: "60", wo1r: "12.99",
    wo2m: "48", wo2r: "8.90",
    wo3m: "12", wo3r: "0",
  });
  const rhTerms = termsFromRhFinanciamiento(CATALOGO, "mexicano");
  if (!rhTerms.length) fail("catálogo mexicano no produjo plazos");
  else ok(`plazos catálogo mexicano: ${rhTerms.map((t) => t.months).join("/")}`);

  const sale = 8000;
  const down = 2000;
  const saleCents = toCents(sale);
  const downCents = toCents(down);

  for (const plazo of [60, 48]) {
    const term = rhTerms.find((t) => t.months === plazo);
    const row = lookupFinanciamientoPlazo(CATALOGO, {
      enganchePct: 25,
      nacionalidad: "mexicano",
      plazoMeses: plazo,
    });
    const matrixCents = mensualidadPara(saleCents, downCents, 99_00, term);
    const finCents = Math.round(calcularMensualidad(sale - down, row.factor_mensual) * 100);
    if (matrixCents !== finCents) {
      fail(`${plazo}m 25% mex: matriz=${matrixCents} financiamiento=${finCents}`);
    } else {
      ok(`${plazo}m 25% mex: matriz = Datos Financiamiento (${finCents} cents)`);
    }

    const pmtTerm = wsTerms.find((t) => t.months === plazo);
    const pmtCents = mensualidadPara(saleCents, downCents, 0, pmtTerm);
    if (pmtCents === matrixCents) {
      fail(`${plazo}m: la matriz RH coincidió con PMT de worksheetConfig (no debe)`);
    } else {
      ok(`${plazo}m: distinta a worksheetConfig PMT (${pmtCents} vs ${matrixCents})`);
    }
  }

  const term12 = rhTerms.find((t) => t.months === 12);
  const na25 = mensualidadPara(saleCents, downCents, 0, term12);
  if (na25 != null) fail(`12m @ 25% debía ser N/A, obtuvo ${na25}`);
  else ok("12m @ 25% mexicano = N/A (sin inventar)");

  const sale45 = 8000;
  const down45 = 3600;
  const ok12 = mensualidadPara(toCents(sale45), toCents(down45), 0, term12);
  const row12 = lookupFinanciamientoPlazo(CATALOGO, {
    enganchePct: 45,
    nacionalidad: "mexicano",
    plazoMeses: 12,
  });
  const expected12 = Math.round(calcularMensualidad(sale45 - down45, row12.factor_mensual) * 100);
  if (ok12 !== expected12) fail(`12m @ 45%: matriz=${ok12} financiamiento=${expected12}`);
  else ok("12m @ 45% mexicano coincide con Datos Financiamiento");

  const restoTerms = termsFromRhFinanciamiento(CATALOGO, "resto");
  const resto60 = restoTerms.find((t) => t.months === 60);
  const restoCents = mensualidadPara(saleCents, downCents, 0, resto60);
  const mex60 = rhTerms.find((t) => t.months === 60);
  const mexCents = mensualidadPara(saleCents, downCents, 0, mex60);
  if (restoCents === mexCents) fail("resto vs mexicano 60m no deben coincidir");
  else ok("nacionalidad cambia el factor (resto ≠ mexicano)");

  const config = defaultPolicyConfig({
    minDownPct: 0.25,
    maxDownPct: 0.45,
    maxSaleCents: toCents(150000),
    roundStepCents: 1,
    ffCents: 0,
  });
  const props = generateDownProposals(toCents(2000), 0, config, rhTerms, 0);
  if (!props.length || props.length > 3) fail(`enganche: opciones=${props.length}`);
  else ok(`enganche: ${props.length} opción(es), ${props[0]?.plans?.length} plazos en matriz`);

  const colLow = props.find((p) => p.downPct < 0.4);
  if (!colLow) fail("no hay columna de enganche < 40% para probar N/A");
  else {
    const plan60 = colLow.plans.find((p) => p.months === 60);
    const plan12 = colLow.plans.find((p) => p.months === 12);
    if (!plan60 || plan60.available === false) fail("60m en enganche bajo debería existir en catálogo");
    else ok("60m disponible en escenario de enganche bajo");
    if (!plan12 || plan12.available !== false) fail("12m en enganche bajo debería ser N/A");
    else ok("12m omitido/N/A cuando el catálogo no tiene la combinación");
  }
} finally {
  if (fs.existsSync(out)) fs.unlinkSync(out);
}

console.log("\n══════════════════════════════════════");
if (failed) {
  console.error(`FAIL — ${failed} criterio(s)`);
  process.exit(1);
}
console.log("PASS — smoke Money Box RH = catálogo Financiamiento");
process.exit(0);
