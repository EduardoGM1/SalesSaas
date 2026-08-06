/**
 * Verifica migraciones 0068–0070 en la DB y aplica las que falten.
 * Uso: node scripts/verify-apply-0068-0070.mjs
 */
import { readFileSync, existsSync } from "fs";
import pg from "pg";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = resolve(root, "supabase/migrations");

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
if (!env.DATABASE_URL) {
  console.error("DATABASE_URL no encontrado");
  process.exit(1);
}

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function tableExists(name) {
  const { rows } = await c.query(
    `select 1 from information_schema.tables where table_schema='public' and table_name=$1`,
    [name],
  );
  return rows.length > 0;
}

async function functionExists(name) {
  const { rows } = await c.query(
    `select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname=$1 limit 1`,
    [name],
  );
  return rows.length > 0;
}

async function check0068() {
  const checks = {
    table_permisos_delegados: await tableExists("permisos_delegados"),
    table_gerente_acceso_cruzado: await tableExists("gerente_acceso_cruzado"),
    fn_user_in_workspace: await functionExists("user_in_workspace"),
    fn_effective_workspace_permissions: await functionExists("effective_workspace_permissions"),
    fn_list_permisos_delegados_keys: await functionExists("list_permisos_delegados_keys"),
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}

async function check0069() {
  const checks = {
    table_migracion_backup: await tableExists("migracion_vendedor_liner_backup"),
    fn_admin_delete_role: await functionExists("admin_delete_role"),
  };
  let linerOk = false;
  let vendedorPlatformGone = true;
  if (await tableExists("roles")) {
    const { rows: liner } = await c.query(
      `select id, nombre, slug from public.roles
       where id = 'a0000000-0000-4000-8000-000000000003'::uuid`,
    );
    linerOk = liner[0]?.slug === "liner" || liner[0]?.nombre === "Liner";
    checks.platform_role_003 = liner[0] || null;

    const { rows: vend } = await c.query(
      `select count(*)::int as n from public.roles
       where empresa_id is null and (slug = 'vendedor' or lower(nombre) = 'vendedor')`,
    );
    vendedorPlatformGone = (vend[0]?.n ?? 0) === 0;
    checks.platform_vendedor_count = vend[0]?.n ?? 0;
  }
  checks.liner_platform_renamed = linerOk;
  checks.platform_vendedor_gone = vendedorPlatformGone;
  return {
    ok: checks.table_migracion_backup && checks.fn_admin_delete_role && linerOk,
    checks,
  };
}

async function check0070() {
  const { rows: perms } = await c.query(
    `select clave from public.permisos
     where clave in (
       'usuarios.export_csv','logs.export_csv','metas.export_csv',
       'metricas.export_csv','ventas.export_csv','soporte.export_csv'
     )`,
  );
  const { rows: defs } = await c.query(
    `select pg_get_functiondef('public.sync_profile_legacy_permissions(uuid)'::regprocedure) as def`,
  );
  const def = defs[0]?.def || "";
  const syncDoesNotOverwrite = !/update\s+public\.profiles[\s\S]*?admin_permissions\s*=/i.test(def);
  const { rows: fnComment } = await c.query(
    `select obj_description('public.admin_set_user_permissions(uuid,text[])'::regprocedure) as c`,
  );
  const checks = {
    export_perms: perms.length,
    sync_preserves_admin_permissions: syncDoesNotOverwrite,
    admin_set_comment: fnComment[0]?.c || null,
    fn_admin_set_user_permissions: await functionExists("admin_set_user_permissions"),
  };
  return {
    ok: perms.length === 6 && syncDoesNotOverwrite && checks.fn_admin_set_user_permissions,
    checks,
  };
}

async function applyMigration(file) {
  const path = resolve(migrationsDir, file);
  const sql = readFileSync(path, "utf8");
  console.log(`\n→ Aplicando ${file}…`);
  await c.query(sql);
  console.log(`✓ ${file} aplicada`);
}

await c.connect();
try {
  console.log("=== Estado migraciones 0068–0070 ===\n");

  let s68 = await check0068();
  console.log("0068 asistentes/acceso cruzado:", s68.ok ? "APLICADA" : "PENDIENTE");
  console.log(JSON.stringify(s68.checks, null, 2));

  let s69 = await check0069();
  console.log("\n0069 vendedor→liner:", s69.ok ? "APLICADA" : "PENDIENTE");
  console.log(JSON.stringify(s69.checks, null, 2));

  let s70 = await check0070();
  console.log("\n0070 admin perms + export:", s70.ok ? "APLICADA" : "PENDIENTE");
  console.log(JSON.stringify(s70.checks, null, 2));

  if (!s68.ok) {
    await applyMigration("0068_asistentes_y_acceso_cruzado.sql");
    s68 = await check0068();
    if (!s68.ok) throw new Error("0068 falló verificación post-apply");
  }

  if (!s69.ok) {
    await applyMigration("0069_migracion_vendedor_a_liner.sql");
    s69 = await check0069();
    if (!s69.ok) throw new Error("0069 falló verificación post-apply");
  }

  if (!s70.ok) {
    await applyMigration("0070_fix_admin_perms_and_export.sql");
    s70 = await check0070();
    if (!s70.ok) throw new Error("0070 falló verificación post-apply");
  }

  console.log("\n=== Resumen final ===");
  console.log(JSON.stringify({
    "0068": s68.ok ? "OK" : "FAIL",
    "0069": s69.ok ? "OK" : "FAIL",
    "0070": s70.ok ? "OK" : "FAIL",
  }, null, 2));
} catch (e) {
  console.error("\nERROR:", e.message);
  process.exit(1);
} finally {
  await c.end();
}
