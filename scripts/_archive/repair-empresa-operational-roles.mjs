/**
 * Repara rol_permisos vacíos de puestos operativos (Gerente/Liner/Cerrador) por empresa.
 * Uso: node scripts/repair-empresa-operational-roles.mjs [empresaId?]
 */
import { readFileSync, existsSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { ensureEmpresaOperationalRoles } from "../apps/api/src/services/empresa-roles-seed.js";

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
  auth: { persistSession: false, autoRefreshToken: false },
});

const argEmpresa = process.argv[2] || null;

const { data: empresas, error } = argEmpresa
  ? await admin.from("empresas").select("id, nombre").eq("id", argEmpresa)
  : await admin.from("empresas").select("id, nombre");
if (error) throw error;

const report = [];
for (const emp of empresas || []) {
  const { data: roles } = await admin
    .from("roles")
    .select("id, slug, rol_permisos(permiso_id)")
    .eq("empresa_id", emp.id)
    .in("slug", ["gerente", "liner", "cerrador"]);

  const before = (roles || []).map((r) => ({
    slug: r.slug,
    n: Array.isArray(r.rol_permisos) ? r.rol_permisos.length : 0,
  }));
  const needs = before.some((r) => r.n === 0);
  if (!needs && !argEmpresa) {
    report.push({ empresa: emp.nombre, skipped: true, before });
    continue;
  }

  await ensureEmpresaOperationalRoles(admin, emp.id);

  const { data: afterRoles } = await admin
    .from("roles")
    .select("id, slug, rol_permisos(permiso_id)")
    .eq("empresa_id", emp.id)
    .in("slug", ["gerente", "liner", "cerrador"]);
  const after = (afterRoles || []).map((r) => ({
    slug: r.slug,
    n: Array.isArray(r.rol_permisos) ? r.rol_permisos.length : 0,
  }));
  report.push({ empresa: emp.nombre, id: emp.id, before, after });
}

console.log(JSON.stringify({ ok: true, report }, null, 2));
