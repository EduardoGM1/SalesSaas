/**
 * Publica el catálogo de mantenimientos 2027 (SDD-03, Anexo A, 61 rangos).
 *
 * No cierra el catálogo 2026 en el momento de correr: el corte queda en
 * 2026-09-23 00:00 America/Mexico_City. Idempotente.
 *
 * No ejecutar hasta el deploy aprobado:
 *   node scripts/publish-rh-mantenimiento-2027.mjs --apply
 */
import { readFileSync, existsSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { publishMantenimientos2027 } from "../apps/api/src/services/royal-holiday-service.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[line.slice(0, i).trim()] = value;
  }
  return out;
}

if (!process.argv.includes("--apply")) {
  console.log("Sin --apply no se escribe nada. El deploy aprobado es el que publica los 61 rangos.");
  process.exit(0);
}

const env = { ...loadEnv(resolve(root, ".env")), ...loadEnv(resolve(root, ".env.local")) };
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const empresaId = process.argv.find((arg) => /^[0-9a-f-]{36}$/i.test(arg));
let target = empresaId;
if (!target) {
  const { data, error } = await admin.from("empresas").select("id").eq("nombre", "Royal Holiday").maybeSingle();
  if (error) throw new Error(error.message);
  target = data?.id;
}
if (!target) {
  console.error("Empresa Royal Holiday no encontrada.");
  process.exit(1);
}

const bundle = await publishMantenimientos2027(admin, target, null);
console.log("catalogo", bundle.catalogo.version, bundle.catalogo.id);
console.log("bottom_line", bundle.bottom_line.length);
console.log("vigente_desde", bundle.catalogo.vigente_desde);
