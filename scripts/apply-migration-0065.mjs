/**
 * Aplica 0065 — alcance membresía en flags + roles Liner/Cerrador.
 * Requiere DATABASE_URL en .env.local
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(__dir, "../supabase/migrations/0065_flag_membresia_and_liner_roles.sql");

function loadEnvLocal() {
  const path = resolve(__dir, "../.env.local");
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i === -1) continue;
    const key = trimmed.slice(0, i).trim();
    let val = trimmed.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"'))
      || (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  loadEnvLocal();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Falta DATABASE_URL en .env.local");
    process.exit(2);
  }
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    console.log("Aplicando 0065…");
    await client.query(sql);
    const { rows } = await client.query(`
      select count(*)::int as liners
      from public.roles
      where slug = 'liner' and empresa_id is not null
    `);
    console.log("✓ Migración 0065 aplicada.");
    console.log("Roles Liner en empresas:", rows[0]?.liners ?? 0);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
