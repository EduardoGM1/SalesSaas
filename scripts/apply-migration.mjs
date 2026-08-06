/**
 * Aplica una migración SQL contra DATABASE_URL (.env / .env.local).
 *
 * Uso:
 *   node scripts/apply-migration.mjs 0075
 *   node scripts/apply-migration.mjs supabase/migrations/0075_superadmin_features_on_admins.sql
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { dirname, resolve, basename } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");
const migrationsDir = resolve(root, "supabase/migrations");

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

function resolveMigrationPath(arg) {
  if (!arg) {
    console.error("Uso: node scripts/apply-migration.mjs <NNNN|ruta.sql>");
    process.exit(1);
  }
  if (arg.endsWith(".sql") || arg.includes("/") || arg.includes("\\")) {
    const abs = resolve(root, arg);
    if (!existsSync(abs)) {
      console.error("No existe:", abs);
      process.exit(1);
    }
    return abs;
  }
  const prefix = String(arg).padStart(4, "0");
  const match = readdirSync(migrationsDir).find((f) => f.startsWith(`${prefix}_`) && f.endsWith(".sql"));
  if (!match) {
    console.error(`No hay migración con prefijo ${prefix} en supabase/migrations/`);
    process.exit(1);
  }
  return resolve(migrationsDir, match);
}

const migrationPath = resolveMigrationPath(process.argv[2]);
const env = { ...loadEnv(resolve(root, ".env")), ...loadEnv(resolve(root, ".env.local")) };
if (!env.DATABASE_URL) {
  console.error("Falta DATABASE_URL en .env o .env.local");
  process.exit(1);
}

const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(readFileSync(migrationPath, "utf8"));
  console.log(`✓ Aplicada: ${basename(migrationPath)}`);
} finally {
  await client.end();
}
