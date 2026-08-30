/**
 * Semilla flags rh.tool.* para empresa Royal Holiday + paquetes.
 * Uso: node scripts/seed-rh-tool-flags.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvFile(path) {
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
const env = { ...loadEnvFile(resolve(root, ".env")), ...loadEnvFile(resolve(root, ".env.local")) };

const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

const PREMANIFIESTO_CHILDREN = new Set([
  "rh.tool.premanifiesto.marketing",
  "rh.tool.premanifiesto.opc",
  "rh.tool.premanifiesto.rep",
  "rh.tool.premanifiesto.csi",
]);

const FLAGS = [
  { clave: "rh.tool.bottom_lines", nombre: "Calculadora B. Lines", padre: "worksheet.royal_holiday" },
  { clave: "rh.tool.comisiones", nombre: "Calculadora Comisiones", padre: "worksheet.royal_holiday" },
  { clave: "rh.tool.calendario_comisiones", nombre: "Calendario comisiones", padre: "worksheet.royal_holiday" },
  { clave: "rh.tool.creditos", nombre: "Calculadora de Créditos", padre: "worksheet.royal_holiday" },
  { clave: "rh.tool.dias_descanso", nombre: "Días de descanso", padre: "worksheet.royal_holiday" },
  { clave: "rh.tool.ops", nombre: "Administrativo operaciones RH", padre: "worksheet.royal_holiday" },
  { clave: "rh.tool.premanifiesto", nombre: "Premanifiesto RH", padre: "rh.tool.ops" },
  { clave: "rh.tool.premanifiesto.marketing", nombre: "Premanifiesto — Marketing", padre: "rh.tool.premanifiesto" },
  { clave: "rh.tool.premanifiesto.opc", nombre: "Premanifiesto — OPC", padre: "rh.tool.premanifiesto" },
  { clave: "rh.tool.premanifiesto.rep", nombre: "Premanifiesto — Rep", padre: "rh.tool.premanifiesto" },
  { clave: "rh.tool.premanifiesto.csi", nombre: "Premanifiesto — CSI (delegación)", padre: "rh.tool.premanifiesto" },
];

const { data: empresa, error: eErr } = await admin
  .from("empresas")
  .select("id, nombre")
  .ilike("nombre", "%Royal Holiday%")
  .maybeSingle();
if (eErr) throw eErr;
if (!empresa) {
  console.error("Empresa Royal Holiday no encontrada. Corre bootstrap-royal-holiday.mjs primero.");
  process.exit(1);
}

const flagIdsByClave = {};

async function ensureFlag({ clave, nombre, padre }) {
  const { data: existing } = await admin
    .from("flags")
    .select("id")
    .eq("empresa_id", empresa.id)
    .eq("clave", clave)
    .maybeSingle();
  if (existing) {
    flagIdsByClave[clave] = existing.id;
    console.log("✓", clave);
    return existing.id;
  }
  let padreId = null;
  if (padre) {
    padreId = flagIdsByClave[padre];
    if (!padreId) {
      const { data: pRow } = await admin
        .from("flags")
        .select("id")
        .eq("empresa_id", empresa.id)
        .eq("clave", padre)
        .maybeSingle();
      padreId = pRow?.id || null;
    }
  }
  const { data, error } = await admin
    .from("flags")
    .insert({
      clave,
      nombre_visible: nombre,
      flag_padre: padreId,
      default_global: true,
      tipo: "custom",
      empresa_id: empresa.id,
      punto_extension: null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`${clave}: ${error.message}`);
  flagIdsByClave[clave] = data.id;
  console.log("+", clave);
  return data.id;
}

for (const f of FLAGS) {
  await ensureFlag(f);
}

const { ensureEmpresaOperationalRoles } = await import("../apps/api/src/services/empresa-roles-seed.js");
await ensureEmpresaOperationalRoles(admin, empresa.id);

const { data: packs } = await admin
  .from("paquetes_acceso")
  .select("id, slug")
  .eq("empresa_id", empresa.id)
  .in("slug", ["operacion-base", "cierre", "liner", "marketing", "opc-lobby"]);

const basePackSlugs = ["operacion-base", "cierre", "liner"];
const marketingFlags = ["worksheet", "worksheet.royal_holiday", "rh.tool.ops", "rh.tool.premanifiesto", "rh.tool.premanifiesto.marketing"];
const opcFlags = ["worksheet", "worksheet.royal_holiday", "rh.tool.ops", "rh.tool.premanifiesto", "rh.tool.premanifiesto.opc"];

function flagsForPack(slug) {
  if (basePackSlugs.includes(slug)) {
    return Object.keys(flagIdsByClave).filter((k) => !PREMANIFIESTO_CHILDREN.has(k));
  }
  if (slug === "marketing") return marketingFlags;
  if (slug === "opc-lobby") return opcFlags;
  return [];
}

for (const pack of packs || []) {
  for (const clave of flagsForPack(pack.slug)) {
    const flagId = flagIdsByClave[clave];
    if (!flagId) continue;
    await admin.from("paquete_flags").upsert(
      { paquete_id: pack.id, flag_id: flagId, activo: true },
      { onConflict: "paquete_id,flag_id" },
    );
  }
}
console.log("✓ Flags RH en paquetes", (packs || []).map((p) => p.slug).join(", "));
