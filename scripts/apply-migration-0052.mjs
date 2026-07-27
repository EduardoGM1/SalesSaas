/**
 * Aplica 0052 — multi-workspace Slack.
 * Preferido: DATABASE_URL en .env.local → npm run db:migrate:0052
 * Alternativa: pegar supabase/migrations/0052_multi_workspace_slack.sql en SQL Editor.
 * Luego: npm run verify:workspaces
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dir = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(__dir, "../supabase/migrations/0052_multi_workspace_slack.sql");

function loadEnvLocal() {
  const path = resolve(__dir, "../.env.local");
  try {
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
  } catch {
    /* opcional */
  }
}

async function main() {
  loadEnvLocal();
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const databaseUrl = process.env.DATABASE_URL;
  const sql = readFileSync(MIGRATION_PATH, "utf8");

  if (!url || !key) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  if (!databaseUrl) {
    console.error("\n⚠️  Añade DATABASE_URL a .env.local o ejecuta en SQL Editor:\n");
    console.error(`Archivo: ${MIGRATION_PATH}\n`);
    process.exit(2);
  }

  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    console.log("Aplicando 0052…");
    await client.query(sql);
    console.log("✓ Migración 0052 aplicada.");
  } finally {
    await client.end();
  }

  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { count } = await sb.from("workspaces").select("id", { count: "exact", head: true });
  console.log("Workspaces:", count);
  console.log("Siguiente: npm run verify:workspaces");
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
