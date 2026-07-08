/**
 * Diagnóstico rápido de sync Supabase (solo lectura + prueba upsert goals).
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { reconcile, pullAll } from "../packages/shared/src/data/sync.js";
import { emptyDatabase } from "../packages/shared/src/storage/types.js";
import { randomUUID } from "crypto";

const __dir = dirname(fileURLToPath(import.meta.url));

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

loadEnvLocal();

const url =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

console.log("=== Diagnóstico Sync ===");
console.log("URL configurada:", Boolean(url));
console.log("Service role:", Boolean(serviceKey));
console.log("Anon key:", Boolean(anonKey));

if (!url || !serviceKey) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const sb = createClient(url, serviceKey);

// 1) Columnas tipo_tour en prospects
const colCheck = await sb.from("prospects").select("tipo_tour,tour_cuantificable").limit(1);
console.log("\n1) Columnas tipo_tour:", colCheck.error ? `ERROR: ${colCheck.error.message}` : "OK");

// 2) Conteos globales
for (const table of ["prospects", "goals", "sales", "calendar_entries"]) {
  const { count, error } = await sb.from(table).select("*", { count: "exact", head: true });
  console.log(`2) ${table}:`, error ? `ERROR ${error.message}` : `${count ?? 0} filas`);
}

// 3) Prueba reconcile con meta de prueba (usuario demo si existe)
const { data: users } = await sb.auth.admin.listUsers({ perPage: 5 });
const testUser = users?.users?.[0];
if (!testUser) {
  console.log("\n3) Sin usuarios para probar reconcile");
  process.exit(0);
}

console.log(`\n3) Probando reconcile para user ${testUser.email} (${testUser.id})`);

const db = emptyDatabase();
db.goals["2026-5"] = { vol: 1000, tours: 10, ventas: 5, dias: 22, desc: 4, updatedAt: Date.now() };
const clientId = randomUUID();
db.clients[clientId] = {
  id: clientId,
  prospectId: clientId,
  prospectCode: "DIAG-001",
  name: "Cliente Diagnóstico",
  tipo_tour: "Q",
  tour_cuantificable: true,
  createdAt: Date.now(),
  data: { survey: {}, vacaciones: {}, worksheet: {} },
  sales: [],
  activities: [],
};

try {
  await reconcile(sb, db, testUser.id);
  const pulled = await pullAll(sb, testUser.id);
  console.log("   reconcile OK");
  console.log("   goals tras pull:", Object.keys(pulled.goals).length);
  console.log("   clients tras pull:", Object.keys(pulled.clients).length);
  // limpiar diagnóstico
  await sb.from("prospects").delete().eq("id", clientId);
  await sb.from("goals").delete().eq("user_id", testUser.id).eq("year", 2026).eq("month", 4);
} catch (err) {
  console.error("   reconcile FALLÓ:", err.message);
  process.exit(1);
}

console.log("\nDiagnóstico completado.");
