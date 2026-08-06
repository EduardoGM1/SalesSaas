/**
 * Prueba RPC admin_set_user_permissions como superadmin (JWT claim simulado).
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

function sameSet(a, b) {
  const A = new Set(a || []);
  const B = new Set(b || []);
  if (A.size !== B.size) return false;
  for (const x of A) if (!B.has(x)) return false;
  return true;
}

await c.connect();
try {
  const { rows: defs } = await c.query(
    `select pg_get_functiondef('public.sync_profile_legacy_permissions(uuid)'::regprocedure) as def`,
  );
  const def = defs[0].def;
  const assignsAdminPerms = /update\s+public\.profiles[\s\S]*?admin_permissions\s*=/i.test(def);
  console.log(JSON.stringify({ sync_assigns_admin_permissions: assignsAdminPerms }, null, 2));

  const { rows: sa } = await c.query(
    `select id, email from public.profiles where is_super_admin = true limit 1`,
  );
  const { rows: tgt } = await c.query(
    `select id, email, admin_permissions from public.profiles
     where role = 'admin' and coalesce(is_super_admin, false) = false limit 1`,
  );
  if (!sa[0] || !tgt[0]) throw new Error("Faltan perfiles de prueba");

  const desired = ["ver_resumen", "gestionar_usuarios", "ver_metricas", "usuarios.export_csv"];
  const before = tgt[0].admin_permissions || [];

  await c.query("begin");
  await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sa[0].id]);
  await c.query(`select set_config('request.jwt.claim.role', 'authenticated', true)`);

  await c.query(`select public.admin_set_user_permissions($1::uuid, $2::text[])`, [
    tgt[0].id,
    desired,
  ]);

  const { rows: afterRows } = await c.query(
    `select admin_permissions from public.profiles where id = $1`,
    [tgt[0].id],
  );
  const after = afterRows[0].admin_permissions || [];

  const { rows: ovs } = await c.query(
    `select p.clave
     from public.usuario_permisos_override o
     join public.permisos p on p.id = o.permiso_id
     where o.usuario_id = $1 and o.otorgado = true and p.clave = any($2::text[])
     order by 1`,
    [tgt[0].id, desired],
  );

  await c.query("rollback");

  const ok = sameSet(after, desired);
  console.log(
    JSON.stringify(
      {
        ok,
        target: tgt[0].email,
        actor: sa[0].email,
        before,
        after,
        overrides: ovs.map((r) => r.clave),
      },
      null,
      2,
    ),
  );
  if (!ok) process.exit(1);
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: e.message }, null, 2));
  try {
    await c.query("rollback");
  } catch {
    /* ignore */
  }
  process.exit(1);
} finally {
  await c.end();
}
