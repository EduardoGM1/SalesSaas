/**
 * Auditoría de datos de prueba a limpiar.
 * Uso: node scripts/audit-test-data-cleanup.mjs
 */
import { readFileSync, existsSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function loadEnv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}
const env = { ...loadEnv(resolve(root, ".env")), ...loadEnv(resolve(root, ".env.local")) };
const admin = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const TEST_EMAIL_RE = /@(test\.saletse\.com|demo\.salesapp\.test|salesapp\.test|qa\.saletse\.com)$/i;
const TEST_EMPRESA_RE = /^(saletse test|empresa qa|qa |test |demo )/i;

const { data: profiles, error } = await admin
  .from("profiles")
  .select("id, email, full_name, role, is_super_admin, created_at");
if (error) throw error;

const testUsers = (profiles || []).filter((p) => TEST_EMAIL_RE.test(String(p.email || "")));
const keepUsers = (profiles || []).filter((p) => !TEST_EMAIL_RE.test(String(p.email || "")));

const { data: empresas } = await admin
  .from("empresas")
  .select("id, nombre, estado, created_at");

const testEmpresas = (empresas || []).filter((e) => {
  const n = String(e.nombre || "");
  return TEST_EMPRESA_RE.test(n) || /test|qa|demo/i.test(n);
});

const testEmpresaIds = new Set(testEmpresas.map((e) => e.id));

const { data: workspaces } = await admin
  .from("workspaces")
  .select("id, nombre, tipo, empresa_id, empresas(nombre)");

const testSalas = (workspaces || []).filter((w) => {
  if (w.tipo !== "sala_de_venta") return false;
  if (w.empresa_id && testEmpresaIds.has(w.empresa_id)) return true;
  const n = String(w.nombre || "");
  return /test|qa|demo/i.test(n);
});

const personalOfTestUsers = (workspaces || []).filter(
  (w) => w.tipo === "personal" && testUsers.some((u) => w.nombre === u.full_name || w.nombre === u.email),
);

console.log(JSON.stringify({
  totals: {
    profiles: (profiles || []).length,
    test_users: testUsers.length,
    keep_users: keepUsers.length,
    empresas: (empresas || []).length,
    test_empresas: testEmpresas.length,
    salas_test: testSalas.length,
  },
  test_users: testUsers.map((u) => ({ id: u.id, email: u.email, name: u.full_name, super: u.is_super_admin })),
  keep_users: keepUsers.map((u) => ({ id: u.id, email: u.email, name: u.full_name, super: u.is_super_admin })),
  test_empresas: testEmpresas,
  test_salas: testSalas.map((w) => ({
    id: w.id,
    nombre: w.nombre,
    empresa: w.empresas?.nombre,
    empresa_id: w.empresa_id,
  })),
}, null, 2));
