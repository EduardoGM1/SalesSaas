/**
 * Carga catálogo v1 Royal Holiday desde Excel.
 * Uso: node scripts/seed-royal-holiday-catalog.mjs [empresaId]
 */
import { readFileSync, existsSync, copyFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");
const excelDest = resolve(root, "docs/royal-holiday/Configuracion-Proyecto.xlsx");
const excelSrc = "c:/Users/eduar/OneDrive/Escritorio/Configuracion Proyecto .xlsx";

function loadEnv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}

const env = { ...loadEnv(resolve(root, ".env")), ...loadEnv(resolve(root, ".env.local")) };
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

mkdirSync(resolve(root, "docs/royal-holiday"), { recursive: true });
if (!existsSync(excelDest) && existsSync(excelSrc)) copyFileSync(excelSrc, excelDest);
if (!existsSync(excelDest)) {
  console.error("No se encontró Excel en", excelDest);
  process.exit(1);
}

let empresaId = process.argv[2];
if (!empresaId) {
  const { data } = await admin.from("empresas").select("id").eq("nombre", "Royal Holiday").maybeSingle();
  empresaId = data?.id;
}
if (!empresaId) {
  console.error("Empresa Royal Holiday no encontrada. Corre bootstrap-royal-holiday.mjs primero.");
  process.exit(1);
}

const { data: existingOpen } = await admin
  .from("catalogo_configuracion")
  .select("id, version")
  .eq("empresa_id", empresaId)
  .is("vigente_hasta", null)
  .maybeSingle();

if (existingOpen) {
  console.log("Ya hay catálogo vigente v" + existingOpen.version, existingOpen.id, "— se omite seed (idempotente).");
  process.exit(0);
}

const { data: last } = await admin
  .from("catalogo_configuracion")
  .select("version")
  .eq("empresa_id", empresaId)
  .order("version", { ascending: false })
  .limit(1)
  .maybeSingle();
const version = (last?.version || 0) + 1;

const { data: catalogo, error: cErr } = await admin
  .from("catalogo_configuracion")
  .insert({
    empresa_id: empresaId,
    version,
    vigente_desde: new Date().toISOString(),
    notas: "Seed desde Configuracion-Proyecto.xlsx",
  })
  .select()
  .single();
if (cErr) throw new Error(cErr.message);
const cid = catalogo.id;

const wb = XLSX.readFile(excelDest);

// --- Financiamiento ---
const finSheet = wb.Sheets["Financiamiento"];
const finRows = XLSX.utils.sheet_to_json(finSheet, { header: 1, defval: "" });
const finInserts = [];
let currentEng = null;
for (const row of finRows) {
  if (row[1] !== "" && row[1] != null && !Number.isNaN(Number(row[1])) && Number(row[1]) < 2) {
    currentEng = Number(row[1]);
  }
  const plazo = Number(row[2]);
  if (!currentEng || !plazo) continue;
  const blocks = [
    { nat: "mexicano", tasa: row[3], factor: row[4] },
    { nat: "resto", tasa: row[6], factor: row[7] },
    { nat: "argentino", tasa: row[9], factor: row[10] },
  ];
  for (const b of blocks) {
    if (b.factor === "N/A" || b.tasa === "N/A" || b.factor === "" || b.factor == null) continue;
    const factor = Number(b.factor);
    const tasa = Number(b.tasa) || 0;
    if (!Number.isFinite(factor)) continue;
    finInserts.push({
      catalogo_configuracion_id: cid,
      enganche_pct: currentEng * 100,
      plazo_meses: plazo,
      nacionalidad: b.nat,
      tasa_interes: tasa * 100,
      factor_mensual: factor,
    });
  }
}
if (finInserts.length) {
  const { error } = await admin.from("rh_financiamiento").insert(finInserts);
  if (error) throw new Error("financiamiento: " + error.message);
}
console.log("✓ financiamiento", finInserts.length);

// --- Comisiones ---
const comSheet = wb.Sheets["Comisiones"];
const comRows = XLSX.utils.sheet_to_json(comSheet, { header: 1, defval: "" });
const ranges = [
  { min: 0, max: 14999, cols: [2, 3, 4] },
  { min: 15000, max: 24999, cols: [5, 6, 7] },
  { min: 25000, max: 999999999, cols: [8, 9, 10] },
];
const positions = ["liner", "closer", "ftb"];
const comInserts = [];
for (let i = 6; i < comRows.length; i++) {
  const row = comRows[i];
  const dp = Number(row[1]);
  if (!Number.isFinite(dp)) continue;
  for (const rg of ranges) {
    for (let p = 0; p < 3; p++) {
      const pct = Number(row[rg.cols[p]]);
      if (!Number.isFinite(pct)) continue;
      comInserts.push({
        catalogo_configuracion_id: cid,
        down_payment_pct: dp * 100,
        hc_rango_min: rg.min,
        hc_rango_max: rg.max,
        posicion: positions[p],
        porcentaje_comision: pct * 100,
      });
    }
  }
}
if (comInserts.length) {
  const { error } = await admin.from("rh_comisiones").insert(comInserts);
  if (error) throw new Error("comisiones: " + error.message);
}
console.log("✓ comisiones", comInserts.length);

// --- Bottom lines ---
const blSheet = wb.Sheets["Botton lines"];
const blRows = XLSX.utils.sheet_to_json(blSheet, { header: 1, defval: "" });
const blInserts = [];
for (let i = 5; i < blRows.length; i++) {
  const row = blRows[i];
  const programa = String(row[1] || "").trim();
  const hc = Number(row[2]);
  if (!programa || !Number.isFinite(hc)) continue;
  blInserts.push({
    catalogo_configuracion_id: cid,
    programa,
    holiday_credits: hc,
    precio_minimo_sin_iva: Number(row[4]) || 0,
    precio_minimo_con_iva: Number(row[5]) || 0,
    cuota_anual_mfee: Number(row[7]) || 0,
  });
}
if (blInserts.length) {
  const { error } = await admin.from("rh_bottom_line").insert(blInserts);
  if (error) throw new Error("bottom_line: " + error.message);
}
console.log("✓ bottom_line", blInserts.length);

// --- Regalos (parse razonable) ---
const regSheet = wb.Sheets["Regalos "] || wb.Sheets["Regalos"];
const regRows = XLSX.utils.sheet_to_json(regSheet, { header: 1, defval: "" });
const regInserts = [];
for (let i = 4; i < regRows.length; i++) {
  const row = regRows[i];
  const nombre = String(row[1] || "").trim();
  if (!nombre || nombre.toLowerCase() === "tours") continue;
  const cargas = [];
  const closing = row[2];
  const venta = row[3];
  const sin = row[4];
  let costo = null;
  const restricciones = {};
  const parseUsdRange = (raw) => {
    const m = String(raw || "").match(/([\d.]+)\s*-\s*([\d.]+)/);
    if (!m) return null;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return { min: Math.min(a, b), max: Math.max(a, b) };
  };
  if (closing !== "" && closing != null && String(closing).toLowerCase() !== "x") {
    const n = Number(String(closing).split("-")[0]);
    if (Number.isFinite(n)) {
      costo = n;
      cargas.push("closing_cost");
    }
  } else if (String(closing).toLowerCase() === "x") cargas.push("closing_cost");
  if (venta !== "" && venta != null && String(venta).toLowerCase() !== "x") {
    const range = parseUsdRange(venta);
    if (range) {
      restricciones.venta_min_usd = range.min;
      restricciones.venta_max_usd = range.max;
      if (!cargas.includes("venta")) cargas.push("venta");
    } else {
      const n = Number(String(venta).split("-")[0]);
      if (Number.isFinite(n)) {
        if (costo == null) costo = n;
        if (!cargas.includes("venta")) cargas.push("venta");
      }
    }
  } else if (String(venta).toLowerCase() === "x") {
    if (!cargas.includes("venta")) cargas.push("venta");
  }
  if (String(sin).toLowerCase() === "x" || (sin !== "" && sin != null && Number.isFinite(Number(sin)))) {
    cargas.push("sin_costo");
    if (costo == null && Number.isFinite(Number(sin))) costo = Number(sin);
  }
  if (!cargas.length) cargas.push("sin_costo");
  const restText = [row[7], row[8], row[9]].filter(Boolean).join(" ");
  const mHc = /venta minima\s*(\d+)\s*hc/i.exec(restText);
  if (mHc) restricciones.venta_minima_hc = Number(mHc[1]) * 1000;
  const mUsd = /\$?\s*([\d,.]+)/.exec(String(row[8] || row[7] || ""));
  if (/venta minima\s*\$/i.test(restText) && mUsd) {
    restricciones.venta_minima_usd = Number(String(mUsd[1]).replace(/,/g, ""));
  }
  if (/flyback/i.test(nombre)) restricciones.venta_minima_usd = 19167.58;
  if (/prevelige|privilege/i.test(nombre)) restricciones.venta_minima_hc = 15000;
  if (/move in/i.test(nombre)) restricciones.moneda_costo = "MXN";
  if (/bono de creditos/i.test(nombre)) {
    restricciones.vigencia_meses = 18;
    restricciones.hc_tiers = [10000, 15000, 30000];
  }

  regInserts.push({
    catalogo_configuracion_id: cid,
    nombre,
    costo,
    cargas_permitidas: cargas,
    restricciones,
    notas: restText || null,
  });
}
if (regInserts.length) {
  const { error } = await admin.from("rh_regalos").insert(regInserts);
  if (error) throw new Error("regalos: " + error.message);
}
console.log("✓ regalos", regInserts.length);

// Costo administrativo + parámetros
const { error: caErr } = await admin.from("rh_costo_administrativo").insert([
  { catalogo_configuracion_id: cid, enganche_pct_min: 15, monto_usd: 750 },
  { catalogo_configuracion_id: cid, enganche_pct_min: 27.5, monto_usd: 950 },
]);
if (caErr) throw new Error(caErr.message);

const { error: pgErr } = await admin.from("rh_parametros_generales").insert({
  catalogo_configuracion_id: cid,
  max_extra_dp: 6,
  max_extra_cc: 6,
  tarjetas_internas: ["Invex", "RCI"],
  moneda: "USD",
  impuestos: {},
  notas_pendientes:
    "Corte costo admin: 15%→750 USD, 27.5%→950 USD (confirmado). Posiciones OPC/X sin comisiones hasta definir en Excel.",
});
if (pgErr) throw new Error(pgErr.message);

console.log("✓ catálogo v" + version, cid);
