#!/usr/bin/env node
/** Limpieza manual QA RH P0 — lee manifest o busca por nombre/email */
import { readFileSync, existsSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const __dir = dirname(fileURLToPath(import.meta.url));
const MANIFEST = resolve(__dir, ".qa-rh-p0-manifest.json");
const EMAILS = ["qa-rh-verify-cross@saletse-test.com", "qa-rh-verify-opsonly@saletse-test.com"];
const QA_EMPRESA = "QA Temp Empresa P0 RH";

function loadEnv() {
  const p = resolve(__dir, "..", ".env.local");
  const out = {};
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

const env = loadEnv();
const pgClient = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

await pgClient.connect();
const q = (sql, p = []) => pgClient.query(sql, p);

let m = {};
if (existsSync(MANIFEST)) m = JSON.parse(readFileSync(MANIFEST, "utf8"));

const { rows: profs } = await q(`SELECT id, email FROM profiles WHERE email = ANY($1::text[])`, [EMAILS]);
const userIds = profs.map((p) => p.id);

if (m.ids?.probe_dia_descanso_id) {
  await q(`DELETE FROM rh_dias_descanso WHERE id = $1`, [m.ids.probe_dia_descanso_id]);
}
await q(`DELETE FROM rh_dias_descanso WHERE notas = 'QA ops-only probe'`);

if (userIds.length) {
  await q(`DELETE FROM flag_reglas WHERE alcance = 'usuario' AND alcance_id = ANY($1::uuid[])`, [userIds]);
  await q(`DELETE FROM workspace_miembros WHERE usuario_id = ANY($1::uuid[])`, [userIds]);
  await q(`DELETE FROM empresa_miembros WHERE usuario_id = ANY($1::uuid[])`, [userIds]);
}

const qaEmpId = m.ids?.qa_empresa_id || (await q(`SELECT id FROM empresas WHERE nombre=$1`, [QA_EMPRESA])).rows[0]?.id;
const qaSalaId = m.ids?.qa_sala_id || (qaEmpId && (await q(`SELECT id FROM workspaces WHERE empresa_id=$1 AND nombre='Sala QA P0'`, [qaEmpId])).rows[0]?.id);

if (qaSalaId) await q(`DELETE FROM workspaces WHERE id = $1`, [qaSalaId]);
if (qaEmpId) await q(`DELETE FROM empresas WHERE id = $1`, [qaEmpId]);

for (const uid of userIds) {
  const { error } = await admin.auth.admin.deleteUser(uid);
  console.log(`deleteUser ${uid}:`, error?.message || "OK");
}

const leftEmp = (await q(`SELECT id FROM empresas WHERE nombre=$1`, [QA_EMPRESA])).rows.length;
const leftProf = (await q(`SELECT email FROM profiles WHERE email = ANY($1::text[])`, [EMAILS])).rows;
console.log("Empresa QA restante:", leftEmp);
console.log("Perfiles restantes:", leftProf);

if (existsSync(MANIFEST)) unlinkSync(MANIFEST);
await pgClient.end();
console.log("Limpieza OK");
