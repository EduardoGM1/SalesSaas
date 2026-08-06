/**
 * Verificación read-only del esquema para módulos custom por empresa.
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

async function cols(table) {
  const { rows } = await c.query(
    `select column_name, data_type, udt_name, is_nullable, column_default
     from information_schema.columns
     where table_schema='public' and table_name=$1
     order by ordinal_position`,
    [table],
  );
  return rows;
}

async function tableExists(name) {
  const { rows } = await c.query(
    `select 1 from information_schema.tables where table_schema='public' and table_name=$1`,
    [name],
  );
  return rows.length > 0;
}

try {
  const tables = [
    "flags", "flag_reglas", "paquetes_acceso", "paquete_flags",
    "modulos_custom", "modulo_custom_datos", "modulos_custom_datos",
    "empresas", "roles",
  ];
  console.log("=== TABLE EXISTS ===");
  for (const t of tables) console.log(t, await tableExists(t));

  for (const t of ["flags", "flag_reglas", "paquetes_acceso", "paquete_flags"]) {
    console.log(`\n=== COLS ${t} ===`);
    console.log(JSON.stringify(await cols(t), null, 2));
  }

  // Search any table with custom/modulo/jsonb pattern
  const { rows: jsonbTables } = await c.query(`
    select table_name, column_name, data_type
    from information_schema.columns
    where table_schema='public'
      and (
        table_name ilike '%modulo%'
        or table_name ilike '%custom%'
        or column_name ilike '%modulo%'
        or (data_type = 'jsonb' and table_name ilike '%flag%')
      )
    order by table_name, ordinal_position
  `);
  console.log("\n=== MODULO/CUSTOM/JSONB RELATED ===");
  console.log(JSON.stringify(jsonbTables, null, 2));

  // Enums / check constraints for alcance
  const { rows: checks } = await c.query(`
    select conname, pg_get_constraintdef(oid) as def
    from pg_constraint
    where conrelid = 'public.flag_reglas'::regclass and contype = 'c'
  `);
  console.log("\n=== FLAG_REGLAS CHECKS ===");
  console.log(checks);

  // Distinct alcances in use
  if (await tableExists("flag_reglas")) {
    const { rows: alc } = await c.query(
      `select alcance, count(*)::int as n from flag_reglas group by 1 order by 1`,
    );
    console.log("\nALCANCE_DIST", alc);
  }

  // flags sample columns values
  if (await tableExists("flags")) {
    const { rows: flagsSample } = await c.query(
      `select * from flags order by clave limit 5`,
    );
    console.log("\nFLAGS_SAMPLE_KEYS", Object.keys(flagsSample[0] || {}));
    console.log("FLAGS_COUNT", (await c.query(`select count(*)::int as n from flags`)).rows[0]);
    // if tipo/empresa_id exist
    const fcols = new Set((await cols("flags")).map((r) => r.column_name));
    console.log("FLAGS_HAS_TIPO", fcols.has("tipo"));
    console.log("FLAGS_HAS_EMPRESA_ID", fcols.has("empresa_id"));
    console.log("FLAGS_HAS_ES_CUSTOM", fcols.has("es_custom") || fcols.has("custom"));
  }

  // paquetes_acceso per empresa
  if (await tableExists("paquetes_acceso")) {
    const pcols = new Set((await cols("paquetes_acceso")).map((r) => r.column_name));
    console.log("\nPAQUETES_HAS_EMPRESA_ID", pcols.has("empresa_id"));
    const { rows: pkgDist } = await c.query(`
      select
        count(*)::int as total,
        count(*) filter (where empresa_id is null)::int as globales,
        count(*) filter (where empresa_id is not null)::int as por_empresa,
        count(distinct empresa_id)::int as empresas_distintas
      from paquetes_acceso
    `);
    console.log("PAQUETES_DIST", pkgDist[0]);
  }

  // empresas count
  console.log("\nEMPRESAS", (await c.query(`select count(*)::int as n from empresas`)).rows[0]);
  console.log("ROLES_TENANT", (await c.query(`select count(*)::int as n from roles where empresa_id is not null`)).rows[0]);
  console.log("ROLES_PLATFORM", (await c.query(`select count(*)::int as n from roles where empresa_id is null`)).rows[0]);

  // RLS on flags / flag_reglas / modulos if any
  for (const t of ["flags", "flag_reglas", "paquetes_acceso", "paquete_flags", "modulos_custom", "modulo_custom_datos"]) {
    if (!(await tableExists(t))) continue;
    const { rows: pol } = await c.query(`
      select polname, polcmd, pg_get_expr(polqual, polrelid) as using_expr
      from pg_policy where polrelid = ('public.' || $1)::regclass
    `, [t]);
    const { rows: [rls] } = await c.query(`
      select relrowsecurity from pg_class where oid = ('public.' || $1)::regclass
    `, [t]);
    console.log(`\nRLS_${t}`, { enabled: rls.relrowsecurity, policies: pol.length, names: pol.map((p) => p.polname) });
  }

  // Functions resolver
  const { rows: fns } = await c.query(`
    select p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public'
      and p.proname in ('resolver_flag','resolver_workspace_flag','resolver_flag_empresa')
  `);
  console.log("\nRESOLVER_FNS", fns.map((r) => r.proname));

} finally {
  await c.end();
}
