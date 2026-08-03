/**
 * Aplica 0064 — transfer personal→sala fuerza representante/cerrador.
 * Requiere DATABASE_URL en .env.local
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(__dir, "../supabase/migrations/0064_transfer_prospect_participants.sql");

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
    console.log("Aplicando 0064…");
    await client.query(sql);
    const { rows } = await client.query(`
      SELECT pg_get_functiondef('public.transfer_prospect_to_sala(uuid,uuid,uuid)'::regprocedure) AS def
    `);
    const def = rows[0]?.def || "";
    const hasForce = def.includes("cerrador_id = null") && def.includes("representante_id = excluded.representante_id");
    console.log("✓ Migración 0064 aplicada.");
    console.log("RPC fuerza representante/cerrador:", hasForce ? "sí" : "revisar");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
