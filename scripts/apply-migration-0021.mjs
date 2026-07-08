/**
 * Aplica la migración 0021 (tipo_tour / tour_cuantificable en prospects).
 *
 * Opción A — SQL Editor de Supabase (sin DATABASE_URL):
 *   Pegar el contenido de supabase/migrations/0021_prospect_tour_type.sql
 *
 * Opción B — Conexión directa Postgres:
 *   Añadir DATABASE_URL en .env.local (Project Settings → Database → URI)
 *   npm run db:migrate:0021
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dir = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(__dir, "../supabase/migrations/0021_prospect_tour_type.sql");

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

async function columnsExist(sb) {
  const { error } = await sb.from("prospects").select("tipo_tour,tour_cuantificable").limit(1);
  return !error;
}

async function applyWithPg(databaseUrl, sql) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
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

  if (!url || !key) {
    console.error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local");
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const sql = readFileSync(MIGRATION_PATH, "utf8");

  if (await columnsExist(sb)) {
    console.log("✓ Columnas tipo_tour / tour_cuantificable ya existen.");
    return;
  }

  if (!databaseUrl) {
    console.error("\n⚠️  Faltan columnas en prospects. Ejecuta este SQL en Supabase → SQL Editor:\n");
    console.error(sql);
    console.error("\nO añade DATABASE_URL a .env.local y vuelve a ejecutar: npm run db:migrate:0021\n");
    process.exit(1);
  }

  console.log("Aplicando migración 0021 vía DATABASE_URL…");
  await applyWithPg(databaseUrl, sql);

  if (!(await columnsExist(sb))) {
    console.error("La migración no surtió efecto. Revisa DATABASE_URL y permisos.");
    process.exit(1);
  }

  console.log("✓ Migración 0021 aplicada correctamente.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
