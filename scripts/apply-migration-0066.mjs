/**
 * Aplica 0066 — admin_list_roles solo plataforma.
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(__dir, "../supabase/migrations/0066_admin_list_roles_platform_only.sql");

function loadEnvLocal() {
  const path = resolve(__dir, "../.env.local");
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i === -1) continue;
    const key = trimmed.slice(0, i).trim();
    let val = trimmed.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  loadEnvLocal();
  if (!process.env.DATABASE_URL) {
    console.error("Falta DATABASE_URL");
    process.exit(2);
  }
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
    console.log("✓ Migración 0066 aplicada.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
