/**
 * Aplica 0050 — limpia tablas/columnas Workspaces (0054) de la BD.
 *
 * Preferido: DATABASE_URL en .env.local
 *   npm run db:migrate:0050
 *
 * Alternativa: pegar supabase/migrations/0050_drop_workspaces_recursos.sql
 * en Supabase → SQL Editor.
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dir = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(__dir, "../supabase/migrations/0050_drop_workspaces_recursos.sql");

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
  // Algunas tablas no tienen columna `id` (PK compuesta).
  const { error } = await sb.from(name).select("*").limit(1);
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

async function columnExists(sb, table, col) {
  const { error } = await sb.from(table).select(col).limit(1);
  if (!error) return true;
  const msg = String(error.message || "");
  if (msg.includes(col) && (msg.includes("does not exist") || msg.includes("Could not find"))) return false;
  if (error.code === "PGRST204" || error.code === "PGRST205") return false;
  return null;
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
    organizaciones: await tableExists(sb, "organizaciones"),
    historial_auditoria: await tableExists(sb, "historial_auditoria"),
    refs: await tableExists(sb, "recurso_workspace_referencias"),
    ws_col: await columnExists(sb, "prospects", "workspace_propietario_id"),
    reshare_col: await columnExists(sb, "prospect_shares", "puede_volver_a_compartir"),
  };
  console.log("Estado previo:", before);

  if (
    !before.workspaces
    && !before.organizaciones
    && !before.historial_auditoria
    && !before.refs
    && before.ws_col === false
    && before.reshare_col === false
  ) {
    console.log("✓ Nada que limpiar.");
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
    console.log("Aplicando 0050…");
    await client.query(sql);
    console.log("✓ Migración 0050 aplicada.");
  } finally {
    await client.end();
  }

  const after = {
    workspaces: await tableExists(sb, "workspaces"),
    organizaciones: await tableExists(sb, "organizaciones"),
    historial_auditoria: await tableExists(sb, "historial_auditoria"),
    refs: await tableExists(sb, "recurso_workspace_referencias"),
    ws_col: await columnExists(sb, "prospects", "workspace_propietario_id"),
    reshare_col: await columnExists(sb, "prospect_shares", "puede_volver_a_compartir"),
  };
  console.log("Estado posterior:", after);
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
