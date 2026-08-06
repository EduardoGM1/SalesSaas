/**
 * Valida caso documento: 10k HC, 15% FTB → 5.25%; Extra DP +10% → diff 3.25%.
 */
import { createRequire } from "module";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const rh = await import("../packages/shared/src/calculations/royal-holiday.js");

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
const admin = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: emp } = await admin.from("empresas").select("id").eq("nombre", "Royal Holiday").single();
const { data: cat } = await admin
  .from("catalogo_configuracion")
  .select("id")
  .eq("empresa_id", emp.id)
  .is("vigente_hasta", null)
  .single();
const { data: comisiones } = await admin.from("rh_comisiones").select("*").eq("catalogo_configuracion_id", cat.id);

const c1 = rh.lookupComision(comisiones, { downPaymentPct: 15, holidayCredits: 10000, posicion: "ftb" });
const c2 = rh.lookupComision(comisiones, { downPaymentPct: 25, holidayCredits: 10000, posicion: "ftb" });
const diff = rh.diferenciaComisionPct(c1?.porcentaje_comision, c2?.porcentaje_comision);
const f1 = rh.toDateStr(rh.calcularFechaPagoComision(new Date("2026-08-10T12:00:00Z")));
const f2 = rh.toDateStr(rh.calcularFechaPagoComision(new Date("2026-08-20T12:00:00Z")));

const ok =
  Number(c1?.porcentaje_comision) === 5.25
  && Number(c2?.porcentaje_comision) === 8.5
  && Number(diff.toFixed(2)) === 3.25
  && f1 === "2026-08-25"
  && f2 === "2026-09-10";

console.log({
  comision_15_ftb: c1?.porcentaje_comision,
  comision_25_ftb: c2?.porcentaje_comision,
  diferencia: diff,
  pago_dia_10: f1,
  pago_dia_20: f2,
  ok,
});
if (!ok) process.exit(1);
console.log("✓ Caso Royal Holiday validado");
