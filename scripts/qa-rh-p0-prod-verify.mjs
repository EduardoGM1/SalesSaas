#!/usr/bin/env node
/**
 * QA P0 Royal Holiday — seed prod, pruebas A/B, limpieza.
 * Uso: node scripts/qa-rh-p0-prod-verify.mjs
 */
import { readFileSync, existsSync, writeFileSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");
const MANIFEST = resolve(__dir, ".qa-rh-p0-manifest.json");
const API_BASE = (process.env.API_BASE ?? "http://187.77.14.148").replace(/\/$/, "");

const RH_ID = "0aee9ad0-5a5e-4532-8b86-95b801f8ee88";
const SALA_RH_ID = "b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815";
const EMAIL_CROSS = "qa-rh-verify-cross@saletse-test.com";
const EMAIL_OPS = "qa-rh-verify-opsonly@saletse-test.com";
const QA_EMPRESA_NOMBRE = "QA Temp Empresa P0 RH";

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

let admin;
let pgClient;
const manifest = { created_at: new Date().toISOString(), ids: {}, flag_regla_ids: [] };

async function pgQ(sql, params = []) {
  return pgClient.query(sql, params);
}

async function ensureAuthUser(email, fullName) {
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) return existing.id;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return data.user.id;
}

async function tokenFor(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(error.message);
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });
  const { data: s, error: ve } = await anon.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });
  if (ve) throw new Error(ve.message);
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
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 400) }; }
  return { status: res.status, json, err: json?.error || json?.message || text.slice(0, 120) };
}

async function setup() {
  console.log("=== SETUP datos QA en prod ===\n");

  manifest.ids.cross_user_id = await ensureAuthUser(EMAIL_CROSS, "QA Cross Tenant");
  manifest.ids.ops_user_id = await ensureAuthUser(EMAIL_OPS, "QA Ops Only");

  let qaEmpresaId;
  const { rows: existingEmp } = await pgQ(`SELECT id FROM empresas WHERE nombre = $1`, [QA_EMPRESA_NOMBRE]);
  if (existingEmp[0]) {
    qaEmpresaId = existingEmp[0].id;
  } else {
    qaEmpresaId = randomUUID();
    await pgQ(`INSERT INTO empresas (id, nombre, estado) VALUES ($1, $2, 'activa')`, [qaEmpresaId, QA_EMPRESA_NOMBRE]);
  }
  manifest.ids.qa_empresa_id = qaEmpresaId;

  let qaSalaId;
  const { rows: existingWs } = await pgQ(
    `SELECT id FROM workspaces WHERE empresa_id = $1 AND nombre = 'Sala QA P0' LIMIT 1`,
    [qaEmpresaId],
  );
  if (existingWs[0]) {
    qaSalaId = existingWs[0].id;
  } else {
    qaSalaId = randomUUID();
    await pgQ(
      `INSERT INTO workspaces (id, tipo, empresa_id, nombre, estado) VALUES ($1, 'sala_de_venta', $2, 'Sala QA P0', 'activo')`,
      [qaSalaId, qaEmpresaId],
    );
  }
  manifest.ids.qa_sala_id = qaSalaId;

  for (const [uid, eid] of [[manifest.ids.cross_user_id, qaEmpresaId]]) {
    await pgQ(
      `INSERT INTO empresa_miembros (empresa_id, usuario_id, es_admin, estado)
       VALUES ($1, $2, false, 'activo') ON CONFLICT (empresa_id, usuario_id) DO NOTHING`,
      [eid, uid],
    );
    await pgQ(
      `INSERT INTO workspace_miembros (usuario_id, workspace_id, rol_en_workspace)
       VALUES ($1, $2, 'vendedor') ON CONFLICT (usuario_id, workspace_id) DO NOTHING`,
      [uid, qaSalaId],
    );
    await pgQ(`UPDATE profiles SET workspace_activo_id = $1 WHERE id = $2`, [qaSalaId, uid]);
  }

  // Ops-only user en Royal Holiday
  await pgQ(
    `INSERT INTO empresa_miembros (empresa_id, usuario_id, es_admin, estado)
     VALUES ($1, $2, false, 'activo') ON CONFLICT (empresa_id, usuario_id) DO NOTHING`,
    [RH_ID, manifest.ids.ops_user_id],
  );
  await pgQ(
    `INSERT INTO workspace_miembros (usuario_id, workspace_id, rol_en_workspace)
     VALUES ($1, $2, 'vendedor') ON CONFLICT (usuario_id, workspace_id) DO NOTHING`,
    [manifest.ids.ops_user_id, SALA_RH_ID],
  );
  await pgQ(`UPDATE profiles SET workspace_activo_id = $1 WHERE id = $2`, [SALA_RH_ID, manifest.ids.ops_user_id]);

  const flagOps = (await pgQ(`SELECT (public.flag_row_for_empresa('rh.tool.ops', $1::uuid)).id AS id`, [RH_ID])).rows[0]?.id;
  const flagDias = (await pgQ(`SELECT (public.flag_row_for_empresa('rh.tool.dias_descanso', $1::uuid)).id AS id`, [RH_ID])).rows[0]?.id;
  const flagBl = (await pgQ(`SELECT (public.flag_row_for_empresa('rh.tool.bottom_lines', $1::uuid)).id AS id`, [RH_ID])).rows[0]?.id;
  if (!flagOps || !flagDias || !flagBl) throw new Error("flags RH (empresa RH) no encontrados");

  const blCrossId = (await pgQ(`SELECT (public.flag_row_for_empresa('rh.tool.bottom_lines', $1::uuid)).id AS id`, [qaEmpresaId])).rows[0]?.id;
  const { rows: frCross } = await pgQ(
    `INSERT INTO flag_reglas (flag_id, alcance, alcance_id, activo)
     VALUES ($1, 'usuario', $2, true)
     ON CONFLICT (flag_id, alcance, alcance_id) DO UPDATE SET activo = true RETURNING id`,
    [blCrossId || flagBl, manifest.ids.cross_user_id],
  );
  manifest.flag_regla_ids.push(frCross[0].id);

  for (const [flagId, activo] of [[flagOps, true], [flagDias, false]]) {
    const { rows } = await pgQ(
      `INSERT INTO flag_reglas (flag_id, alcance, alcance_id, activo)
       VALUES ($1, 'usuario', $2, $3)
       ON CONFLICT (flag_id, alcance, alcance_id) DO UPDATE SET activo = EXCLUDED.activo
       RETURNING id`,
      [flagId, manifest.ids.ops_user_id, activo],
    );
    manifest.flag_regla_ids.push(rows[0].id);
  }

  // Registro dias_descanso en RH para ver si ops-only lo ve
  const { rows: diaRow } = await pgQ(
    `INSERT INTO rh_dias_descanso (empresa_id, workspace_id, usuario_id, fecha, tipo, notas)
     VALUES ($1, $2, $3, '2099-07-01', 'descanso', 'QA ops-only probe')
     RETURNING id`,
    [RH_ID, SALA_RH_ID, manifest.ids.ops_user_id],
  );
  manifest.ids.probe_dia_descanso_id = diaRow[0]?.id;

  // Verificar flags resueltos
  const { rows: resolved } = await pgQ(
    `SELECT resolver_workspace_flag('rh.tool.ops', $1, $2) AS ops,
            resolver_workspace_flag('rh.tool.dias_descanso', $1, $2) AS dias`,
    [manifest.ids.ops_user_id, SALA_RH_ID],
  );
  manifest.resolved_flags_ops_user = resolved[0];

  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log("IDs creados:", JSON.stringify(manifest.ids, null, 2));
  console.log("Flags ops-only resueltos:", manifest.resolved_flags_ops_user);
  console.log("");
}

function endpoints(empresaId, workspaceId) {
  const wsQ = workspaceId ? `?workspaceId=${workspaceId}` : "";
  return [
    ["catalogo", "GET", `/royal-holiday/${empresaId}/catalogo`],
    ["preview", "POST", `/royal-holiday/${empresaId}/preview`, { holiday_credits: 10000, monto_venta: 10000, enganche_pct: 15, posicion: "ftb" }],
    ["ventas", "POST", `/royal-holiday/${empresaId}/ventas`, { workspace_id: workspaceId, holiday_credits: 10000, monto_venta: 10000, enganche_pct: 15 }],
    ["comisiones-mov", "GET", `/royal-holiday/${empresaId}/comisiones-movimientos${wsQ}`],
    ["dias-descanso GET", "GET", `/royal-holiday/${empresaId}/dias-descanso${wsQ}`],
    ["dias-descanso POST", "POST", `/royal-holiday/${empresaId}/dias-descanso`, { workspace_id: workspaceId, usuario_id: "00000000-0000-0000-0000-000000000001", fecha: "2099-08-01" }],
    ["ops-config GET", "GET", `/royal-holiday/${empresaId}/ops-config`],
    ["ops-config PUT", "PUT", `/royal-holiday/${empresaId}/ops-config`, { config: { qa: true } }],
    ["premanifiesto GET", "GET", `/royal-holiday/${empresaId}/premanifiesto${wsQ}`],
    ["premanifiesto POST", "POST", `/royal-holiday/${empresaId}/premanifiesto`, { workspace_id: workspaceId, fecha: "2099-08-01" }],
    ["linea/asig GET", "GET", `/royal-holiday/${empresaId}/linea/asignacion${wsQ}`],
    ["linea/asig POST", "POST", `/royal-holiday/${empresaId}/linea/asignacion`, { workspace_id: workspaceId, fecha: "2099-08-01" }],
    ["linea/rot GET", "GET", `/royal-holiday/${empresaId}/linea/rotacion${wsQ}`],
    ["linea/rot POST", "POST", `/royal-holiday/${empresaId}/linea/rotacion`, { workspace_id: workspaceId, fecha: "2099-08-01" }],
    ["propinas GET", "GET", `/royal-holiday/${empresaId}/propinas${wsQ}`],
    ["propinas POST", "POST", `/royal-holiday/${empresaId}/propinas`, { workspace_id: workspaceId, monto: 1, fecha: "2099-08-01" }],
    ["okr GET", "GET", `/royal-holiday/${empresaId}/okr${wsQ}`],
    ["okr POST", "POST", `/royal-holiday/${empresaId}/okr`, { workspace_id: workspaceId, periodo: "2099-Q3", clave: "qa" }],
    ["resumen", "GET", `/royal-holiday/${empresaId}/resumen${wsQ}`],
  ];
}

async function runTestA() {
  console.log("=== PRUEBA A — Cross-tenant real ===\n");
  const resultsA = [];
  let criticalFail = false;

  const tokenCross = await tokenFor(EMAIL_CROSS);
  const tokenRh = await tokenFor("michell.ruiz.t@gmail.com");

  console.log("A1) Usuario QA → endpoints Royal Holiday (empresa real)\n");
  for (const [name, method, path, body] of endpoints(RH_ID, SALA_RH_ID)) {
    const r = await api(path, { method, token: tokenCross, body });
    const leak = r.status === 200 && r.json?.data != null;
    const ok = r.status === 403 && !leak;
    if (!ok) criticalFail = true;
    resultsA.push({ direction: "QA→RH", endpoint: name, status: r.status, error: r.err, ok });
    console.log(`  ${ok ? "OK" : "FAIL"} ${name}: HTTP ${r.status} — ${String(r.err).slice(0, 80)}${leak ? " [DATA LEAK]" : ""}`);
  }

  console.log("\nA2) Usuario Royal Holiday (michell) → endpoints empresa QA (empresa real)\n");
  for (const [name, method, path, body] of endpoints(manifest.ids.qa_empresa_id, manifest.ids.qa_sala_id)) {
    const r = await api(path, { method, token: tokenRh, body });
    const leak = r.status === 200 && r.json?.data != null;
    const ok = r.status === 403 && !leak;
    if (!ok) criticalFail = true;
    resultsA.push({ direction: "RH→QA", endpoint: name, status: r.status, error: r.err, ok });
    console.log(`  ${ok ? "OK" : "FAIL"} ${name}: HTTP ${r.status} — ${String(r.err).slice(0, 80)}${leak ? " [DATA LEAK]" : ""}`);
  }

  return { resultsA, criticalFail };
}

async function runTestB() {
  console.log("\n=== PRUEBA B — Ops-only GET dias-descanso ===\n");
  const tokenOps = await tokenFor(EMAIL_OPS);
  const r = await api(`/royal-holiday/${RH_ID}/dias-descanso?workspaceId=${SALA_RH_ID}`, { token: tokenOps });
  const count = Array.isArray(r.json?.data) ? r.json.data.length : null;
  console.log(`  HTTP ${r.status}; error=${r.err}; registros=${count}`);
  if (r.status === 200 && count != null) {
    console.log(`  IDs visibles: ${r.json.data.map((d) => d.id?.slice(0, 8)).join(", ") || "ninguno"}`);
  }
  return { status: r.status, error: r.err, count, data: r.json?.data };
}

async function cleanup() {
  console.log("\n=== LIMPIEZA prod ===\n");
  const m = manifest;

  if (m.ids.probe_dia_descanso_id) {
    await pgQ(`DELETE FROM rh_dias_descanso WHERE id = $1`, [m.ids.probe_dia_descanso_id]);
  }
  if (m.flag_regla_ids?.length) {
    await pgQ(`DELETE FROM flag_reglas WHERE id = ANY($1::uuid[])`, [m.flag_regla_ids]);
  }

  for (const uid of [m.ids.cross_user_id, m.ids.ops_user_id].filter(Boolean)) {
    const { error } = await admin.auth.admin.deleteUser(uid);
    console.log(`  deleteUser ${uid.slice(0, 8)}…: ${error ? error.message : "OK"}`);
  }

  if (m.ids.qa_sala_id) {
    await pgQ(`DELETE FROM workspaces WHERE id = $1`, [m.ids.qa_sala_id]);
  }
  if (m.ids.qa_empresa_id) {
    await pgQ(`DELETE FROM empresas WHERE id = $1`, [m.ids.qa_empresa_id]);
  }

  // Verificación post-limpieza
  const { rows: empLeft } = await pgQ(`SELECT id FROM empresas WHERE nombre = $1`, [QA_EMPRESA_NOMBRE]);
  const { rows: usersLeft } = await pgQ(
    `SELECT email FROM profiles WHERE email = ANY($1::text[])`,
    [[EMAIL_CROSS, EMAIL_OPS]],
  );
  console.log(`\n  Empresa QA restante: ${empLeft.length}`);
  console.log(`  Perfiles test restantes: ${usersLeft.length}`);

  if (existsSync(MANIFEST)) unlinkSync(MANIFEST);
  console.log("\nLimpieza completada.\n");
}

async function main() {
  if (!DATABASE_URL || !SERVICE_KEY) {
    console.error("Faltan DATABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  pgClient = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pgClient.connect();

  try {
    await setup();
    const { resultsA, criticalFail } = await runTestA();
    const testB = await runTestB();

    if (criticalFail) {
      console.error("\n*** HALLAZGO CRÍTICO en Prueba A — NO se ejecutó limpieza. Revisa prod. ***\n");
      console.log("Manifest:", MANIFEST);
      process.exit(2);
    }

    await cleanup();

    console.log("=== RESUMEN ENTREGA ===");
    console.log("\nPrueba A (todos deben ser 403):");
    console.log("| Dirección | Endpoint | HTTP | OK |");
    console.log("|---|---|---|---|");
    for (const r of resultsA) {
      console.log(`| ${r.direction} | ${r.endpoint} | ${r.status} | ${r.ok ? "✅" : "❌"} |`);
    }
    console.log("\nPrueba B ops-only GET dias-descanso:");
    console.log(`  HTTP ${testB.status}, registros=${testB.count}, error=${testB.error}`);
  } finally {
    await pgClient.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
