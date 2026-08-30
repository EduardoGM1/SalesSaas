/**
 * Crea empresa Royal Holiday + sala vía workspace-service (mismo flujo Admin).
 * Uso: node scripts/bootstrap-royal-holiday.mjs
 */
import { readFileSync, existsSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

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
if (!url || !key) {
  console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

process.env.SUPABASE_URL = url;
process.env.SUPABASE_SERVICE_ROLE_KEY = key;

const { createEmpresa, createSala } = await import("../apps/api/src/services/workspace-service.js");
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const GERENTE_EMAIL = "eduardolalito99@hotmail.com";
const EMPRESA_NOMBRE = "Royal Holiday";
const SALA_NOMBRE = "Sala Royal Holiday";

const { data: gerente, error: gErr } = await admin
  .from("profiles")
  .select("id, email, full_name, is_super_admin, role")
  .eq("email", GERENTE_EMAIL)
  .maybeSingle();
if (gErr || !gerente) {
  console.error("No se encontró perfil:", GERENTE_EMAIL, gErr?.message);
  process.exit(1);
}

const { data: superRow } = await admin
  .from("profiles")
  .select("id, role, is_super_admin")
  .eq("is_super_admin", true)
  .limit(1)
  .maybeSingle();

const adminProfile = {
  id: superRow?.id || gerente.id,
  role: "admin",
  is_super_admin: true,
  admin_permissions: [],
};

let { data: empresa } = await admin.from("empresas").select("*").eq("nombre", EMPRESA_NOMBRE).maybeSingle();
if (!empresa) {
  empresa = await createEmpresa(adminProfile, { nombre: EMPRESA_NOMBRE, estado: "activa" });
  console.log("✓ Empresa creada:", empresa.id);
} else {
  console.log("✓ Empresa ya existía:", empresa.id);
}

// Asegurar roles operativos (idempotente)
const { ensureEmpresaOperationalRoles } = await import("../apps/api/src/services/empresa-roles-seed.js");
await ensureEmpresaOperationalRoles(admin, empresa.id);

let { data: sala } = await admin
  .from("workspaces")
  .select("*")
  .eq("empresa_id", empresa.id)
  .eq("tipo", "sala_de_venta")
  .eq("nombre", SALA_NOMBRE)
  .maybeSingle();

if (!sala) {
  sala = await createSala(adminProfile, {
    empresa_id: empresa.id,
    nombre: SALA_NOMBRE,
    gerente_id: gerente.id,
  });
  console.log("✓ Sala creada:", sala.id, "gerente:", GERENTE_EMAIL);
} else {
  console.log("✓ Sala ya existía:", sala.id);
}

// Flag custom worksheet.royal_holiday para esta empresa
const { data: parentFlag } = await admin.from("flags").select("id").eq("clave", "worksheet").is("empresa_id", null).maybeSingle();
let { data: rhFlag } = await admin
  .from("flags")
  .select("id, clave")
  .eq("empresa_id", empresa.id)
  .eq("clave", "worksheet.royal_holiday")
  .maybeSingle();

if (!rhFlag) {
  const { data: created, error } = await admin
    .from("flags")
    .insert({
      clave: "worksheet.royal_holiday",
      nombre_visible: "Worksheet Royal Holiday",
      flag_padre: parentFlag?.id || null,
      default_global: true,
      tipo: "custom",
      empresa_id: empresa.id,
      punto_extension: "worksheet.variante",
      schema_ui: { variante: "royal_holiday" },
    })
    .select("id, clave")
    .single();
  if (error) throw new Error(error.message);
  rhFlag = created;
  console.log("✓ Flag worksheet.royal_holiday creado");
} else {
  console.log("✓ Flag ya existía");
}

// Incluir en paquetes operacion-base y cierre
const { data: packs } = await admin
  .from("paquetes_acceso")
  .select("id, slug")
  .eq("empresa_id", empresa.id)
  .in("slug", ["operacion-base", "cierre", "liner"]);

for (const pack of packs || []) {
  // Liner también usa worksheet en RH
  await admin.from("paquete_flags").upsert(
    { paquete_id: pack.id, flag_id: rhFlag.id, activo: true },
    { onConflict: "paquete_id,flag_id" },
  );
}
console.log("✓ Flag en paquetes de la empresa");

// Pestaña Money Box (hijo de worksheet.royal_holiday)
let { data: mbFlag } = await admin
  .from("flags")
  .select("id, clave")
  .eq("empresa_id", empresa.id)
  .eq("clave", "worksheet.royal_holiday.money_box")
  .maybeSingle();

if (!mbFlag) {
  const { data: created, error } = await admin
    .from("flags")
    .insert({
      clave: "worksheet.royal_holiday.money_box",
      nombre_visible: "Money Box (Worksheet RH)",
      flag_padre: rhFlag.id,
      default_global: true,
      tipo: "custom",
      empresa_id: empresa.id,
      punto_extension: "worksheet.tab",
    })
    .select("id, clave")
    .single();
  if (error) throw new Error(error.message);
  mbFlag = created;
  console.log("✓ Flag worksheet.royal_holiday.money_box creado");
} else {
  console.log("✓ Flag money_box tab ya existía");
}

for (const pack of packs || []) {
  await admin.from("paquete_flags").upsert(
    { paquete_id: pack.id, flag_id: mbFlag.id, activo: true },
    { onConflict: "paquete_id,flag_id" },
  );
}
console.log("✓ Tab Money Box en paquetes RH");

// Flags rh.tool.* (incl. Premanifiesto) + paquetes marketing/opc
const { execSync } = await import("child_process");
try {
  execSync("node scripts/seed-rh-tool-flags.mjs", { cwd: root, stdio: "inherit" });
} catch {
  console.warn("seed-rh-tool-flags.mjs falló — revisar manualmente");
}

// Olás Premanifiesto (idempotente; migración 0087 también las siembra)
const olasSeed = [
  { orden: 1, etiqueta: "OLA 1", hora: "09:00:00", cupo_max: 10 },
  { orden: 2, etiqueta: "OLA 2", hora: "10:30:00", cupo_max: 5 },
  { orden: 3, etiqueta: "OLA 3", hora: "12:30:00", cupo_max: 5 },
];
for (const o of olasSeed) {
  await admin.from("rh_premanifiesto_ola_config").upsert(
    { empresa_id: empresa.id, ...o, activo: true },
    { onConflict: "empresa_id,orden" },
  );
}
console.log("✓ Olás Premanifiesto default");

// empresa_miembros: gerente como admin empresa para Back Office
await admin.from("empresa_miembros").upsert(
  { empresa_id: empresa.id, usuario_id: gerente.id, es_admin: true },
  { onConflict: "empresa_id,usuario_id" },
);

const { data: roles } = await admin
  .from("roles")
  .select("slug")
  .eq("empresa_id", empresa.id)
  .order("slug");
console.log("Roles tenant:", (roles || []).map((r) => r.slug).join(", "));
console.log(JSON.stringify({ empresa_id: empresa.id, sala_id: sala.id, flag_id: rhFlag.id, gerente_id: gerente.id }, null, 2));
