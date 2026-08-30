#!/usr/bin/env node
/**
 * Verificación Fase 1 Premanifiesto RH — schema, RPC cupo concurrente, CSI gating.
 * Uso: node scripts/verify-rh-premanifiesto-fase1.mjs
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");
const API_BASE = (process.env.API_BASE ?? "http://187.77.14.148").replace(/\/$/, "");
const RH_ID = process.env.RH_EMPRESA_ID ?? "0aee9ad0-5a5e-4532-8b86-95b801f8ee88";
const SALA_ID = process.env.RH_SALA_ID ?? "b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815";
const GERENTE_EMAIL = process.env.RH_GERENTE_EMAIL ?? "eduardolalito99@hotmail.com";

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
const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const SUPABASE_ANON = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL = env.DATABASE_URL;

const results = [];
const record = (id, obs, ok) => results.push({ id, obs, ok: ok ? "PASS" : "FAIL" });

let admin;

async function sessionForEmail(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`${email}: ${error.message}`);
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });
  const { data: s, error: ve } = await anon.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });
  if (ve) throw new Error(`verify ${email}: ${ve.message}`);
  return s.session.access_token;
}

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, json };
}

async function verifySchema() {
  if (!DATABASE_URL) {
    record("SCHEMA", "DATABASE_URL no configurada — omitido", false);
    return;
  }
  const c = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const { rows: tbl } = await c.query(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='rh_premanifiesto_ola_config') AS ok",
  );
  record("SCHEMA ola_config", "tabla rh_premanifiesto_ola_config", tbl[0]?.ok === true);

  const { rows: rpc } = await c.query(
    `SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname IN (
       'rh_premanifiesto_dia','rh_premanifiesto_registrar_pareja',
       'rh_premanifiesto_tomar_caso','rh_premanifiesto_actualizar'
     )`,
  );
  record("SCHEMA RPCs", `count=${rpc[0]?.n}`, rpc[0]?.n === 4);

  const { rows: flags } = await c.query(
    `SELECT count(*)::int n FROM flags WHERE empresa_id=$1 AND clave LIKE 'rh.tool.premanifiesto%'`,
    [RH_ID],
  );
  record("SCHEMA flags PM", `count=${flags[0]?.n}`, flags[0]?.n >= 5);

  const { rows: olas } = await c.query(
    "SELECT count(*)::int n FROM rh_premanifiesto_ola_config WHERE empresa_id=$1",
    [RH_ID],
  );
  record("SCHEMA olas seed", `count=${olas[0]?.n}`, olas[0]?.n >= 3);
  await c.end();
}

async function verifyConcurrency(userId, olaId, fecha) {
  const mkClient = () => new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const run = async (suffix) => {
    const c = mkClient();
    await c.connect();
    try {
      await c.query(
        `SELECT public.rh_premanifiesto_registrar_pareja(
          $1::uuid, $2::uuid, $3::date, $4::uuid, 'marketing', $5, $6::uuid
        )`,
        [RH_ID, SALA_ID, fecha, olaId, `Conc-${suffix}-${Date.now()}`, userId],
      );
      return { ok: true };
    } catch (e) {
      return { ok: false, err: String(e.message || e) };
    } finally {
      await c.end();
    }
  };
  const [a, b] = await Promise.all([run("A"), run("B")]);
  const okCount = [a, b].filter((x) => x.ok).length;
  const cupoFull = [a, b].some((x) => x.err?.includes("PM_CUPO_LLENO"));
  record("CUPO concurrencia RPC", `ok=${okCount} cupo_lleno=${cupoFull}`, okCount === 1 && cupoFull);
}

async function verifyCsiGating(tokenMarketing, tokenGerente, fecha) {
  const diaM = await api(
    `/royal-holiday/${RH_ID}/premanifiesto/dia?workspaceId=${SALA_ID}&fecha=${fecha}`,
    { token: tokenMarketing },
  );
  const diaG = await api(
    `/royal-holiday/${RH_ID}/premanifiesto/dia?workspaceId=${SALA_ID}&fecha=${fecha}`,
    { token: tokenGerente },
  );
  const entradasM = (diaM.json?.data?.olas || []).flatMap((o) => o.entradas || []);
  const entradasG = (diaG.json?.data?.olas || []).flatMap((o) => o.entradas || []);
  const withCsiM = entradasM.some((e) => e.notas_csi != null);
  const withCsiG = entradasG.some((e) => e.notas_csi != null);
  record("CSI marketing ve notas_csi", `entries=${entradasM.length}`, entradasM.length === 0 || withCsiM);
  record("CSI gerente ve notas_csi", `entries=${entradasG.length}`, entradasG.length === 0 || withCsiG);
}

async function main() {
  if (!SERVICE_KEY || !SUPABASE_URL) {
    console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  await verifySchema();

  const fecha = new Date().toISOString().slice(0, 10);
  let token;
  let gerenteId;
  try {
    token = await sessionForEmail(GERENTE_EMAIL);
    const { data: prof } = await admin.from("profiles").select("id").eq("email", GERENTE_EMAIL).single();
    gerenteId = prof?.id;
  } catch (e) {
    record("AUTH gerente", e.message, false);
    printReport();
    process.exit(1);
  }

  if (gerenteId && DATABASE_URL) {
    const c = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await c.connect();
    const { rows } = await c.query(
      "SELECT public.resolver_workspace_flag('rh.tool.premanifiesto.marketing', $1::uuid, $2::uuid) AS ok",
      [gerenteId, SALA_ID],
    );
    record("AUTH marketing flag gerente", `resolver=${rows[0]?.ok}`, rows[0]?.ok === true);
    await c.end();
  }

  const { data: olas } = await admin
    .from("rh_premanifiesto_ola_config")
    .select("id, orden, cupo_max")
    .eq("empresa_id", RH_ID)
    .eq("activo", true)
    .order("orden");
  if (!olas?.length) {
    record("OLAS config", "sin olas activas", false);
    printReport();
    process.exit(1);
  }

  const testOla = olas.find((o) => o.orden === 3) || olas[olas.length - 1];
  await admin
    .from("rh_premanifiesto_ola_config")
    .update({ cupo_max: 1, updated_at: new Date().toISOString() })
    .eq("id", testOla.id);

  await admin
    .from("rh_premanifiesto")
    .delete()
    .eq("workspace_id", SALA_ID)
    .eq("fecha", fecha)
    .eq("ola_config_id", testOla.id);

  await verifyConcurrency(gerenteId, testOla.id, fecha);

  await admin
    .from("rh_premanifiesto_ola_config")
    .update({ cupo_max: testOla.cupo_max, updated_at: new Date().toISOString() })
    .eq("id", testOla.id);

  await verifyCsiGating(token, token, fecha);

  const cancelTest = await admin
    .from("rh_premanifiesto")
    .select("id")
    .eq("workspace_id", SALA_ID)
    .eq("fecha", fecha)
    .eq("ola_config_id", testOla.id)
    .neq("status", "cancelado")
    .limit(1)
    .maybeSingle();
  if (cancelTest.data?.id) {
    await admin
      .from("rh_premanifiesto")
      .update({ status: "cancelado" })
      .eq("id", cancelTest.data.id);
    const { count } = await admin
      .from("rh_premanifiesto")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", SALA_ID)
      .eq("fecha", fecha)
      .eq("ola_config_id", testOla.id)
      .neq("status", "cancelado");
    record("CUPO cancelado no cuenta", `activos=${count}`, count === 0);
  }

  printReport();
}

function printReport() {
  console.log("\n=== Premanifiesto Fase 1 ===");
  for (const r of results) {
    console.log(`${r.ok}  ${r.id}: ${r.obs}`);
  }
  const failed = results.filter((r) => r.ok === "FAIL").length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
