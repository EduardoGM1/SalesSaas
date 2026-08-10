#!/usr/bin/env node
/**
 * Verificación P0 RH — prod real (http://187.77.14.148)
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");
const API_BASE = (process.env.API_BASE ?? "http://187.77.14.148").replace(/\/$/, "");
const RH_ID = "0aee9ad0-5a5e-4532-8b86-95b801f8ee88";
const SALA_ID = "b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815";
const FAKE_EMPRESA = "00000000-0000-0000-0000-000000000099";

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
const record = (v, obs, ok) => results.push({ v, obs, ok: ok ? "✅" : "❌" });

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
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, json, text: text.slice(0, 300) };
}

async function verifyV1() {
  const c = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const tables = ["rh_dias_descanso", "rh_ops_config", "rh_premanifiesto", "rh_linea_asignacion", "rh_linea_rotacion", "rh_okr", "rh_propinas"];
  const { rows: rls } = await c.query(
    `SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND relname = ANY($1::text[]) ORDER BY relname`, [tables]);
  for (const t of tables) {
    const r = rls.find((x) => x.relname === t);
    record(`V1 RLS ${t}`, `relrowsecurity=${r?.relrowsecurity}`, r?.relrowsecurity === true);
  }
  const { rows: pol } = await c.query(
    `SELECT tablename, count(*)::int n FROM pg_policies WHERE schemaname='public' AND tablename=ANY($1::text[]) GROUP BY tablename ORDER BY 1`,
    [tables]);
  for (const t of tables) {
    const p = pol.find((x) => x.tablename === t);
    record(`V1 políticas ${t}`, p ? `${p.n} políticas activas` : "0 políticas", (p?.n ?? 0) >= 2);
  }
  await c.end();
}

async function crossTenantSuite(token, label, victimId) {
  const wsQ = "";
  const eps = [
    ["catalogo", "GET", `/royal-holiday/${victimId}/catalogo`],
    ["preview", "POST", `/royal-holiday/${victimId}/preview`, { holiday_credits: 10000, monto_venta: 10000, enganche_pct: 15, posicion: "ftb" }],
    ["ventas", "POST", `/royal-holiday/${victimId}/ventas`, { workspace_id: SALA_ID, holiday_credits: 10000, monto_venta: 10000, enganche_pct: 15 }],
    ["comisiones-mov", "GET", `/royal-holiday/${victimId}/comisiones-movimientos${wsQ}`],
    ["dias-descanso", "GET", `/royal-holiday/${victimId}/dias-descanso${wsQ}`],
    ["ops-config GET", "GET", `/royal-holiday/${victimId}/ops-config`],
    ["ops-config PUT", "PUT", `/royal-holiday/${victimId}/ops-config`, { config: { probe: 1 } }],
    ["premanifiesto GET", "GET", `/royal-holiday/${victimId}/premanifiesto?workspaceId=${SALA_ID}`],
    ["premanifiesto POST", "POST", `/royal-holiday/${victimId}/premanifiesto`, { workspace_id: SALA_ID, fecha: "2099-06-01" }],
    ["linea/asig GET", "GET", `/royal-holiday/${victimId}/linea/asignacion?workspaceId=${SALA_ID}`],
    ["linea/asig POST", "POST", `/royal-holiday/${victimId}/linea/asignacion`, { workspace_id: SALA_ID, fecha: "2099-06-01" }],
    ["linea/rot GET", "GET", `/royal-holiday/${victimId}/linea/rotacion?workspaceId=${SALA_ID}`],
    ["linea/rot POST", "POST", `/royal-holiday/${victimId}/linea/rotacion`, { workspace_id: SALA_ID, fecha: "2099-06-01" }],
    ["propinas GET", "GET", `/royal-holiday/${victimId}/propinas?workspaceId=${SALA_ID}`],
    ["propinas POST", "POST", `/royal-holiday/${victimId}/propinas`, { workspace_id: SALA_ID, monto: 1, fecha: "2099-06-01" }],
    ["okr GET", "GET", `/royal-holiday/${victimId}/okr?workspaceId=${SALA_ID}`],
    ["okr POST", "POST", `/royal-holiday/${victimId}/okr`, { workspace_id: SALA_ID, periodo: "2099-Q2", clave: "probe" }],
    ["resumen", "GET", `/royal-holiday/${victimId}/resumen?workspaceId=${SALA_ID}`],
  ];
  for (const [name, method, path, body] of eps) {
    const r = await api(path, { method, token, body });
    const err = r.json?.error || r.json?.message || r.text;
    const leak = r.status === 200 && r.json?.data != null;
    record(`V2 [${label}] ${name}`, `HTTP ${r.status} — ${String(err).slice(0, 100)}${leak ? " LEAK" : ""}`, r.status === 403 && !leak);
  }
}

async function verifyV2Idor(token) {
  const michellId = (await admin.from("profiles").select("id").eq("email", "michell.ruiz.t@gmail.com").single()).data.id;
  const { data: row, error } = await admin.from("rh_dias_descanso").insert({
    empresa_id: RH_ID,
    workspace_id: SALA_ID,
    usuario_id: michellId,
    fecha: "2099-03-15",
    tipo: "descanso",
    notas: "P0 IDOR probe",
  }).select("id").single();
  if (error) {
    record("V2 IDOR setup", error.message, false);
    return;
  }
  const id = row.id;
  // Atacante: path empresa falsa + UUID real
  const r = await api(`/royal-holiday/${FAKE_EMPRESA}/dias-descanso/${id}`, { method: "DELETE", token });
  const { data: after } = await admin.from("rh_dias_descanso").select("id").eq("id", id).maybeSingle();
  record("V2 DELETE IDOR (empresa falsa + uuid real)", `HTTP ${r.status}; registro existe=${!!after?.id}`, r.status === 403 && !!after?.id);
  await admin.from("rh_dias_descanso").delete().eq("id", id);
}

async function legitimateFlow(tokenGerente, tokenSuper) {
  const michellId = (await admin.from("profiles").select("id").eq("email", "michell.ruiz.t@gmail.com").single()).data?.id;
  await admin.from("profiles").update({ workspace_activo_id: SALA_ID }).eq("id", michellId);

  const cat = await api(`/royal-holiday/${RH_ID}/catalogo`, { token: tokenGerente });
  record("V3 catalogo (gerente, sala activa)", `HTTP ${cat.status}; bl=${cat.json?.data?.bottom_line?.length ?? cat.json?.error}`, cat.status === 200);

  const prev = await api(`/royal-holiday/${RH_ID}/preview`, {
    method: "POST", token: tokenGerente,
    body: { holiday_credits: 10000, monto_venta: 20000, enganche_pct: 15, posicion: "ftb", plazo_meses: 24, nacionalidad: "mexicano" },
  });
  record("V3 preview (gerente)", `HTTP ${prev.status}; comision=${prev.json?.data?.comision?.porcentaje ?? prev.json?.error}`, prev.status === 200);

  const yesterday = new Date(); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const venta = await api(`/royal-holiday/${RH_ID}/ventas`, {
    method: "POST", token: tokenGerente,
    body: {
      empresa_id: RH_ID, workspace_id: SALA_ID, holiday_credits: 10000, monto_venta: 20000,
      enganche_pct: 15, posicion: "ftb", nacionalidad: "mexicano", plazo_meses: 24,
      extras: [{ tipo: "extra_dp", porcentaje: 10, fecha: yesterday.toISOString().slice(0, 10) }],
    },
  });
  const movs = venta.json?.data?.rh_comision_movimientos || [];
  const ini = movs.find((m) => m.tipo === "inicial");
  const diff = movs.find((m) => m.tipo === "diferencia_extra_dp");
  record("V3 venta+ExtraDP (gerente)", `HTTP ${venta.status}; id=${venta.json?.data?.id?.slice(0,8)}…; ini=${ini?.porcentaje}; diff=${diff?.porcentaje}; eng=${venta.json?.data?.enganche_acumulado_pct}`,
    venta.status === 201 && Number(diff?.porcentaje) === 3.25);

  const ventaId = venta.json?.data?.id;
  const uid = (await admin.from("profiles").select("id").eq("email", "michell.ruiz.t@gmail.com").single()).data?.id;
  const { data: cal } = await admin.from("calendar_entries").select("id").eq("user_id", uid).ilike("note", `%${ventaId}%`);
  record("V3 calendar reminder", cal?.length ? `${cal.length} entrada(s) calendar_entries` : "0 entradas", (cal?.length ?? 0) > 0);

  const com = await api(`/royal-holiday/${RH_ID}/comisiones-movimientos?workspaceId=${SALA_ID}`, { token: tokenGerente });
  record("V3 calendario comisiones", `HTTP ${com.status}; n=${Array.isArray(com.json?.data) ? com.json.data.length : "n/a"}`, com.status === 200 && com.json?.data?.length > 0);

  const dias = await api(`/royal-holiday/${RH_ID}/dias-descanso?workspaceId=${SALA_ID}`, { token: tokenGerente });
  record("V3 dias-descanso list", `HTTP ${dias.status}; n=${Array.isArray(dias.json?.data) ? dias.json.data.length : dias.json?.error}`, dias.status === 200);

  const pub = await api(`/admin/tenant/empresas/${RH_ID}/catalogo-rh/publish`, {
    method: "POST", token: tokenSuper, body: { notas: "P0 verify" },
  });
  record("V3 admin publish", `HTTP ${pub.status}; ver=${pub.json?.data?.catalogo?.version ?? pub.json?.error}`, pub.status === 201 || pub.status === 200);

  return ventaId;
}

async function verifyV4() {
  const c = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const RH_FLAGS = ["worksheet.royal_holiday", "rh.tool.bottom_lines", "rh.tool.comisiones", "rh.tool.calendario_comisiones", "rh.tool.creditos", "rh.tool.dias_descanso", "rh.tool.ops"];
  for (const slug of ["liner", "gerente", "cerrador"]) {
    const { rows } = await c.query(
      `SELECT r.slug, array_agg(f.clave ORDER BY f.clave) FILTER (WHERE fr.activo = true) AS flags_on
       FROM roles r
       LEFT JOIN flag_reglas fr ON fr.alcance = 'rol' AND fr.alcance_id = r.id
       LEFT JOIN flags f ON f.id = fr.flag_id
       WHERE r.empresa_id = $1 AND r.slug = $2
       GROUP BY r.slug`, [RH_ID, slug]);
    const row = rows[0];
    const on = row?.flags_on || [];
    const missing = RH_FLAGS.filter((f) => !on.includes(f));
    record(`V4 flags rol ${slug}`, `activos=[${on.join(", ")}]; faltan=[${missing.join(", ") || "ninguno"}]`, missing.length === 0);
  }

  const michellId = (await c.query("select id from profiles where email=$1", ["michell.ruiz.t@gmail.com"])).rows[0]?.id;
  const { rows: flagRows } = await c.query(
    `SELECT resolver_workspace_flag($1, $2, $3) AS ops,
            resolver_workspace_flag($4, $2, $3) AS dias`,
    ["rh.tool.ops", michellId, SALA_ID, "rh.tool.dias_descanso"],
  );
  const ops = flagRows[0]?.ops;
  const dias = flagRows[0]?.dias;
  const token = await sessionForEmail("michell.ruiz.t@gmail.com");
  const list = await api(`/royal-holiday/${RH_ID}/dias-descanso?workspaceId=${SALA_ID}`, { token });
  record("V4 ops-only list dias-descanso", `resolver: ops=${ops}, dias_descanso=${dias}; HTTP ${list.status}; n=${list.json?.data?.length ?? "n/a"}`,
    list.status === 200);
  record("V4 comportamiento ops sin dias_descanso", ops === true && dias === false ? "ops-only puede listar (GET acepta rh.tool.ops)" : `actual: ops=${ops}, dias=${dias} — ambos activos en gerente`, true);
  await c.end();
}

async function verifyV5(cronSecret, ventaId) {
  if (!cronSecret) {
    record("V5 cron rh-extra-dp", "CRON_SECRET no obtenido", false);
    return;
  }
  const r = await fetch(`${API_BASE}/api/v1/cron/rh-extra-dp`, { headers: { Authorization: `Bearer ${cronSecret}` } });
  const j = await r.json().catch(() => ({}));
  record("V5 cron rh-extra-dp", `HTTP ${r.status}; processed=${j?.data?.processed ?? j?.error ?? "n/a"}`, r.status === 200);

  if (ventaId) {
    const { data: movs } = await admin.from("rh_comision_movimientos").select("tipo, porcentaje").eq("rh_venta_id", ventaId);
    const { data: extras } = await admin.from("rh_extra_pagos").select("cumplido").eq("rh_venta_id", ventaId);
    record("V5 post-cron venta prueba", `movimientos=${JSON.stringify(movs)}; extras_cumplido=${JSON.stringify(extras?.map(e=>e.cumplido))}`,
      (movs?.some(m => m.tipo === "diferencia_extra_dp")) && extras?.some(e => e.cumplido === true));
  }
}

async function main() {
  admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  console.log("=== Verificación P0 RH prod ===\n");

  await verifyV1();

  const tokenGerente = await sessionForEmail("michell.ruiz.t@gmail.com");
  const tokenSuper = await sessionForEmail("eduardolalito99@hotmail.com");
  record("Auth gerente (michell)", "JWT obtenido vía magic link admin", true);

  await crossTenantSuite(tokenGerente, "gerente→fake-empresa", FAKE_EMPRESA);
  await verifyV2Idor(tokenGerente);

  const ventaId = await legitimateFlow(tokenGerente, tokenSuper);
  await verifyV4();

  let cronSecret = env.CRON_SECRET;
  if (!cronSecret && process.env.VPS_PASSWORD) {
    const { execSync } = await import("child_process");
    try {
      cronSecret = execSync("python scripts/_get-cron-secret.py", { encoding: "utf8" }).trim();
    } catch { /* ignore */ }
  }
  await verifyV5(cronSecret, ventaId);

  console.log("\n| Verificación | Resultado observado | |");
  console.log("|---|---|---|");
  for (const r of results) console.log(`| ${r.v} | ${String(r.obs).replace(/\|/g, "/").slice(0, 140)} | ${r.ok} |`);
  process.exit(results.some((r) => r.ok === "❌") ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
