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

const FLAGS = [
  { clave: "rh.tool.bottom_lines", nombre: "Calculadora B. Lines" },
  { clave: "rh.tool.comisiones", nombre: "Calculadora Comisiones" },
  { clave: "rh.tool.calendario_comisiones", nombre: "Calendario comisiones" },
  { clave: "rh.tool.creditos", nombre: "Calculadora de Créditos" },
  { clave: "rh.tool.dias_descanso", nombre: "Días de descanso" },
  { clave: "rh.tool.ops", nombre: "Administrativo operaciones RH" },
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

const { data: parent } = await admin
  .from("flags")
  .select("id")
  .eq("clave", "worksheet.royal_holiday")
  .eq("empresa_id", empresa.id)
  .maybeSingle();

const createdIds = [];
for (const f of FLAGS) {
  const { data: existing } = await admin
    .from("flags")
    .select("id")
    .eq("empresa_id", empresa.id)
    .eq("clave", f.clave)
    .maybeSingle();
  if (existing) {
    createdIds.push(existing.id);
    console.log("✓", f.clave);
    continue;
  }
  const { data, error } = await admin
    .from("flags")
    .insert({
      clave: f.clave,
      nombre_visible: f.nombre,
      flag_padre: parent?.id || null,
      default_global: true,
      tipo: "custom",
      empresa_id: empresa.id,
      punto_extension: null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`${f.clave}: ${error.message}`);
  createdIds.push(data.id);
  console.log("+", f.clave);
}

const { data: packs } = await admin
  .from("paquetes_acceso")
  .select("id, slug")
  .eq("empresa_id", empresa.id)
  .in("slug", ["operacion-base", "cierre", "liner"]);

for (const pack of packs || []) {
  for (const flagId of createdIds) {
    await admin.from("paquete_flags").upsert(
      { paquete_id: pack.id, flag_id: flagId, activo: true },
      { onConflict: "paquete_id,flag_id" },
    );
  }
}
console.log("✓ Flags RH en paquetes", (packs || []).map((p) => p.slug).join(", "));
