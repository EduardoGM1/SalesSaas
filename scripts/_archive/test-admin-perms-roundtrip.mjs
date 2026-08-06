/**
 * Prueba real: setear permisos admin y verificar persistencia + sync.
 * Uso: node scripts/test-admin-perms-roundtrip.mjs
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
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows: admins } = await c.query(
  `select id, email, admin_permissions, role_id
   from public.profiles
   where role = 'admin' and coalesce(is_super_admin, false) = false
   limit 1`,
);
if (!admins.length) {
  console.log("No admin delegado para probar");
  await c.end();
  process.exit(0);
}
const target = admins[0];
console.log("target", target);

const before = target.admin_permissions;
const payload = ["ver_resumen", "gestionar_usuarios", "gestionar_metas"];

// Necesitamos auth.uid() de superadmin para RPC — usar set local role + claim es complejo.
// En su lugar: replicar la lógica del RPC como service y luego llamar sync.
await c.query("begin");
await c.query(
  `update public.profiles set admin_permissions = $2::text[] where id = $1`,
  [target.id, payload],
);
const mid = await c.query(`select admin_permissions from public.profiles where id = $1`, [target.id]);
console.log("after direct update", mid.rows[0].admin_permissions);

await c.query(`select public.sync_profile_legacy_permissions($1)`, [target.id]);
const afterSync = await c.query(
  `select admin_permissions, user_permissions, role from public.profiles where id = $1`,
  [target.id],
);
console.log("after sync_profile_legacy_permissions", afterSync.rows[0]);

// restaurar
await c.query(`update public.profiles set admin_permissions = $2::text[] where id = $1`, [target.id, before]);
await c.query("commit");

// resolve_user_permission_keys for this user
const keys = await c.query(`select public.resolve_user_permission_keys($1) as keys`, [target.id]);
console.log("resolve_user_permission_keys", keys.rows[0].keys);

const rolePerms = await c.query(
  `select p.clave from public.rol_permisos rp
   join public.permisos p on p.id = rp.permiso_id
   where rp.rol_id = $1 order by 1`,
  [target.role_id],
);
console.log("role_id perms", rolePerms.rows.map((r) => r.clave));

await c.end();
