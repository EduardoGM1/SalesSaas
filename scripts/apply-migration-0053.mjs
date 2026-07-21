/**
 * Aplica 0053 — limpia módulos/grupos/chats de 0050–0052.
 *
 * Preferido: DATABASE_URL en .env.local
 *   node scripts/apply-migration-0053.mjs
 *
 * Alternativa: pegar supabase/migrations/0053_drop_modulos_grupos_chats.sql
 * en Supabase → SQL Editor.
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dir = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(__dir, "../supabase/migrations/0053_drop_modulos_grupos_chats.sql");

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
  const { error } = await sb.from(name).select("*", { count: "exact", head: true });
  if (!error) return true;
  const msg = String(error.message || "");
  if (msg.includes("does not exist") || msg.includes("schema cache") || error.code === "PGRST205") {
    return false;
  }
  // Otras errores (RLS etc.) → asumir que existe
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
    modulos: await tableExists(sb, "modulos"),
    grupos: await tableExists(sb, "grupos"),
    chat_conversations: await tableExists(sb, "chat_conversations"),
    organizaciones: await tableExists(sb, "organizaciones"),
  };
  console.log("Estado previo:", before);

  if (!before.modulos && !before.grupos && !before.chat_conversations && !before.organizaciones) {
    console.log("✓ Tablas legacy ya no existen. Nada que limpiar vía API.");
    console.log("  (Si quedaran funciones/policies, aplica igual el SQL 0053 en el SQL Editor.)");
    return;
  }

  if (!databaseUrl) {
    console.error("\n⚠️  Hay tablas legacy. Añade DATABASE_URL a .env.local o ejecuta en SQL Editor:\n");
    console.error(`Archivo: ${MIGRATION_PATH}\n`);
    process.exit(2);
  }

  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    console.log("Aplicando 0053…");
    await client.query(sql);
    console.log("✓ Migración 0053 aplicada.");
  } finally {
    await client.end();
  }

  const after = {
    modulos: await tableExists(sb, "modulos"),
    grupos: await tableExists(sb, "grupos"),
    chat_conversations: await tableExists(sb, "chat_conversations"),
    organizaciones: await tableExists(sb, "organizaciones"),
  };
  console.log("Estado posterior:", after);
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
