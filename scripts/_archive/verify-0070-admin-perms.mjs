/**
 * Prueba real: persistencia admin_permissions + catálogo export + sync no pisa.
 * Uso: node scripts/verify-0070-admin-perms.mjs
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
const report = [];
try {
  const { rows: exportPerms } = await c.query(`
    select clave from public.permisos
    where clave in (
      'usuarios.export_csv','logs.export_csv','metas.export_csv',
      'metricas.export_csv','ventas.export_csv','soporte.export_csv'
    )
    order by clave
  `);
  report.push(`export_catalog=${exportPerms.length}/6`);
  if (exportPerms.length !== 6) throw new Error("Faltan permisos de exportación en catálogo");

  const { rows: targets } = await c.query(`
    select id, email, admin_permissions
    from public.profiles
    where role = 'admin' and coalesce(is_super_admin, false) = false
    order by created_at
    limit 1
  `);
  if (!targets.length) throw new Error("No hay admin no-super para probar");
  const target = targets[0];
  const before = target.admin_permissions || [];
  report.push(`target=${target.email} before=${JSON.stringify(before)}`);

  const desired = [
    "ver_resumen",
    "gestionar_usuarios",
    "gestionar_metas",
    "usuarios.export_csv",
    "logs.export_csv",
  ];

  // Simular lo que hace admin_set_user_permissions sin auth.uid (direct update + sync)
  await c.query(
    `update public.profiles set admin_permissions = $2::text[] where id = $1`,
    [target.id, desired],
  );
  await c.query(`select public.sync_profile_legacy_permissions($1::uuid)`, [target.id]);

  const { rows: afterSync } = await c.query(
    `select admin_permissions from public.profiles where id = $1`,
    [target.id],
  );
  const after = afterSync[0].admin_permissions || [];
  report.push(`after_sync=${JSON.stringify(after)}`);
  if (!sameSet(after, desired)) {
    throw new Error(
      `SYNC PISÓ admin_permissions. esperado=${JSON.stringify(desired)} obtuvo=${JSON.stringify(after)}`,
    );
  }
  report.push("sync_preserves_admin_permissions=OK");

  // Overrides: insertar vía función si existe admin_set_user_permission_overrides
  const { rows: ov } = await c.query(
    `
    select p.clave
    from public.usuario_permisos_override o
    join public.permisos p on p.id = o.permiso_id
    where o.usuario_id = $1 and o.otorgado = true
      and p.clave = any($2::text[])
    order by p.clave
    `,
    [target.id, desired],
  );
  report.push(`overrides_matching_desired=${ov.map((r) => r.clave).join(",") || "(ninguno aún — se crean vía RPC admin_set_user_permissions)"}`);

  // Restaurar before
  await c.query(
    `update public.profiles set admin_permissions = $2::text[] where id = $1`,
    [target.id, before],
  );
  await c.query(`select public.sync_profile_legacy_permissions($1::uuid)`, [target.id]);
  report.push("restored=OK");

  console.log(JSON.stringify({ ok: true, report }, null, 2));
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: e.message, report }, null, 2));
  process.exit(1);
} finally {
  await c.end();
}
