/**
 * Sincroniza rh_regalos del catálogo vigente con el Excel Saletse (reglas Worksheet).
 * Actualiza por nombre (conserva ids) e inserta faltantes. No publica versión nueva.
 * Uso: node scripts/sync-rh-regalos-excel.mjs [empresaId]
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import {
  RH_REGALOS_EXCEL,
  claveRegaloExcel,
} from "../packages/shared/src/calculations/royal-holiday-regalos-catalog.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");

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

const excelSrc = "c:/Users/eduar/OneDrive/Escritorio/Saletse - Royal Hoilday.xlsx";
const excelDest = resolve(root, "docs/royal-holiday/Saletse-Royal-Holiday.xlsx");
mkdirSync(resolve(root, "docs/royal-holiday"), { recursive: true });
if (existsSync(excelSrc)) copyFileSync(excelSrc, excelDest);

let empresaId = process.argv[2];
if (!empresaId) {
  const { data } = await admin.from("empresas").select("id").eq("nombre", "Royal Holiday").maybeSingle();
  empresaId = data?.id;
}
if (!empresaId) {
  console.error("Empresa Royal Holiday no encontrada.");
  process.exit(1);
}

const { data: cat, error: catErr } = await admin
  .from("catalogo_configuracion")
  .select("id, version")
  .eq("empresa_id", empresaId)
  .is("vigente_hasta", null)
  .maybeSingle();
if (catErr) throw new Error(catErr.message);
if (!cat) {
  console.error("No hay catálogo vigente.");
  process.exit(1);
}

const cid = cat.id;
const { data: actuales, error: regErr } = await admin
  .from("rh_regalos")
  .select("id,nombre,costo,cargas_permitidas,restricciones,notas")
  .eq("catalogo_configuracion_id", cid);
if (regErr) throw new Error(regErr.message);

const byClave = new Map();
for (const row of actuales || []) {
  const k = claveRegaloExcel(row.nombre, row.restricciones);
  if (!byClave.has(k)) byClave.set(k, row);
}

let updated = 0;
let inserted = 0;
for (const g of RH_REGALOS_EXCEL) {
  const k = claveRegaloExcel(g.nombre, g.restricciones);
  const existing = byClave.get(k);
  const payload = {
    nombre: g.nombre,
    costo: g.costo,
    cargas_permitidas: g.cargas_permitidas,
    restricciones: g.restricciones,
    notas: g.notas || null,
  };
  if (existing) {
    const { error } = await admin.from("rh_regalos").update(payload).eq("id", existing.id);
    if (error) throw new Error(`update ${g.nombre}: ${error.message}`);
    updated++;
    byClave.delete(k);
  } else {
    const { error } = await admin.from("rh_regalos").insert({
      catalogo_configuracion_id: cid,
      ...payload,
    });
    if (error) throw new Error(`insert ${g.nombre}: ${error.message}`);
    inserted++;
  }
}

console.log(JSON.stringify({
  catalogo: cid,
  version: cat.version,
  updated,
  inserted,
  leftover: [...byClave.keys()],
}, null, 2));
console.log("✓ regalos sincronizados con Excel Saletse");
