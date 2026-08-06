/**
 * Aplica 0072 — resolvers tenant-aware + RLS flags/custom datos.
 * Uso: node scripts/apply-migration-0072.mjs
 */
import { readFileSync, existsSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");
const MIGRATION_PATH = resolve(root, "supabase/migrations/0072_tenant_aware_flags_resolvers_rls.sql");

function loadEnv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}

const env = { ...loadEnv(resolve(root, ".env")), ...loadEnv(resolve(root, ".env.local")) };
const databaseUrl = env.DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Falta DATABASE_URL");
  process.exit(1);
}

const sql = readFileSync(MIGRATION_PATH, "utf8");
const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  console.log("✓ Migración 0072 aplicada");
  const { rows } = await client.query(`
    select proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and proname in ('flag_row_for_empresa','resolver_session_flags','resolver_workspace_flag','resolver_flag')
    order by 1
  `);
  console.log("Funciones:", rows.map((r) => r.proname).join(", "));
} finally {
  await client.end();
}
