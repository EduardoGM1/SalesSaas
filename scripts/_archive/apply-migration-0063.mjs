/**
 * Aplica 0063 — RBAC aditivo.
 * Requiere DATABASE_URL en .env.local
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(__dir, "../supabase/migrations/0063_rbac_additive_overrides.sql");

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
    console.log("Aplicando 0063…");
    await client.query(sql);
    const globalOv = await client.query(`
      SELECT count(*) FILTER (WHERE otorgado) AS adds,
             count(*) FILTER (WHERE NOT otorgado) AS denies
      FROM public.usuario_permisos_override
    `);
    const salaOv = await client.query(`
      SELECT count(*) FILTER (WHERE otorgado) AS adds,
             count(*) FILTER (WHERE NOT otorgado) AS denies
      FROM public.workspace_usuario_permisos_override
    `);
    console.log("✓ Migración 0063 aplicada.");
    console.log("usuario_permisos_override:", globalOv.rows[0]);
    console.log("workspace_usuario_permisos_override:", salaOv.rows[0]);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
