/**
 * Aplica la migración 0007 en Supabase remoto vía SQL (requiere service role + pg no disponible).
 * Alternativa: pegar supabase/migrations/0007_admin_permissions.sql en el SQL Editor de Supabase.
 *
 * Este script marca al super admin vía API si las columnas ya existen.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const TARGET_EMAIL = "eduardolalito99@hotmail.com";

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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Faltan variables en .env.local");
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: listed } = await sb.auth.admin.listUsers({ perPage: 200 });
  const user = listed?.users.find((u) => u.email?.toLowerCase() === TARGET_EMAIL.toLowerCase());
  if (!user) {
    console.error(`No se encontró ${TARGET_EMAIL}`);
    process.exit(1);
  }

  const { error } = await sb
    .from("profiles")
    .update({ role: "admin", is_super_admin: true, admin_permissions: [] })
    .eq("id", user.id);

  if (error) {
    console.error("\n⚠️  Ejecuta primero la migración SQL en Supabase Dashboard:");
    console.error("   supabase/migrations/0007_admin_permissions.sql\n");
    console.error("Error:", error.message);
    process.exit(1);
  }

  console.log(`✓ Super admin configurado: ${TARGET_EMAIL}`);
}

main();
