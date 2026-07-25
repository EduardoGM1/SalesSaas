/**
 * Aplica 0054 — workspaces, recurso único, auditoría.
 *
 * Preferido: DATABASE_URL en .env.local
 *   npm run db:migrate:0054
 *
 * Alternativa: pegar supabase/migrations/0054_workspaces_recursos.sql
 * en Supabase → SQL Editor.
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dir = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(__dir, "../supabase/migrations/0054_workspaces_recursos.sql");

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

async function tableExists(sb, name) {
  const { error } = await sb.from(name).select("id").limit(1);
  if (!error) return true;
  const msg = String(error.message || "");
  const code = String(error.code || "");
  if (
    code === "PGRST205"
    || code === "42P01"
    || msg.includes("does not exist")
    || msg.includes("schema cache")
    || msg.includes("Could not find the table")
  ) {
    return false;
  }
  return true;
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

  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const before = {
    workspaces: await tableExists(sb, "workspaces"),
    historial_auditoria: await tableExists(sb, "historial_auditoria"),
    recurso_workspace_referencias: await tableExists(sb, "recurso_workspace_referencias"),
  };
  console.log("Estado previo:", before);

  const allPresent =
    before.workspaces && before.historial_auditoria && before.recurso_workspace_referencias;

  if (allPresent && !process.env.FORCE_0054) {
    console.log("✓ Tablas 0054 ya existen. Nada que aplicar vía API.");
    console.log("  (FORCE_0054=1 para reaplicar el SQL con DATABASE_URL.)");
    return;
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
    console.log("Aplicando 0054…");
    await client.query(sql);
    console.log("✓ Migración 0054 aplicada.");
  } finally {
    await client.end();
  }

  const after = {
    workspaces: await tableExists(sb, "workspaces"),
    historial_auditoria: await tableExists(sb, "historial_auditoria"),
    recurso_workspace_referencias: await tableExists(sb, "recurso_workspace_referencias"),
  };
  console.log("Estado posterior:", after);
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
