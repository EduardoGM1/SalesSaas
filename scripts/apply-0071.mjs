/**
 * Aplica migración 0071 y verifica permisos.
 */
import { readFileSync, existsSync } from "fs";
import pg from "pg";
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
const sql = readFileSync(resolve(root, "supabase/migrations/0071_usuarios_plan_y_desactivar.sql"), "utf8");
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query(sql);
  const { rows } = await c.query(`
    select clave from public.permisos
    where clave in ('usuarios.cambiar_plan','usuarios.desactivar_cuenta')
    order by 1
  `);
  const { rows: rp } = await c.query(`
    select p.clave from public.rol_permisos rp
    join public.roles r on r.id = rp.rol_id
    join public.permisos p on p.id = rp.permiso_id
    where r.slug = 'superadmin' and r.empresa_id is null
      and p.clave in ('usuarios.cambiar_plan','usuarios.desactivar_cuenta')
    order by 1
  `);
  console.log(JSON.stringify({
    ok: rows.length === 2,
    permisos: rows.map((r) => r.clave),
    superadmin_grants: rp.map((r) => r.clave),
  }, null, 2));
  if (rows.length !== 2) process.exit(1);
} catch (e) {
  console.error("FAIL", e.message);
  process.exit(1);
} finally {
  await c.end();
}
