import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");

function loadEnv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}

const env = { ...loadEnv(resolve(root, ".env")), ...loadEnv(resolve(root, ".env.local")) };
process.env.SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const { saveVenta } = await import("../apps/api/src/services/royal-holiday-service.js");
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: emp } = await admin.from("empresas").select("id").eq("nombre", "Royal Holiday").single();
const { data: sala } = await admin
  .from("workspaces")
  .select("id")
  .eq("empresa_id", emp.id)
  .eq("tipo", "sala_de_venta")
  .limit(1)
  .single();
const { data: user } = await admin.from("profiles").select("id").eq("email", "eduardolalito99@hotmail.com").single();

const yesterday = new Date();
yesterday.setUTCDate(yesterday.getUTCDate() - 1);

const venta = await saveVenta(user.id, {
  empresa_id: emp.id,
  workspace_id: sala.id,
  holiday_credits: 10000,
  monto_venta: 20000,
  enganche_pct: 15,
  posicion: "ftb",
  nacionalidad: "mexicano",
  plazo_meses: 24,
  extras: [{ tipo: "extra_dp", porcentaje: 10, fecha: yesterday.toISOString().slice(0, 10) }],
});

const movs = venta.rh_comision_movimientos || [];
const inicial = movs.find((m) => m.tipo === "inicial");
const diff = movs.find((m) => m.tipo === "diferencia_extra_dp");
const ok =
  Number(inicial?.porcentaje) === 5.25
  && Number(diff?.porcentaje) === 3.25
  && Number(venta.enganche_acumulado_pct) === 25;

console.log({
  venta_id: venta.id,
  enganche_acumulado: venta.enganche_acumulado_pct,
  inicial: inicial?.porcentaje,
  diferencia: diff?.porcentaje,
  ok,
});
if (!ok) process.exit(1);
console.log("✓ Venta + Extra DP OK");
