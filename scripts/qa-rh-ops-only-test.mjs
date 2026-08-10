#!/usr/bin/env node
/** Prueba B ops-only vía paquete_acceso + limpieza */
import { readFileSync, existsSync, unlinkSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const __dir = dirname(fileURLToPath(import.meta.url));
const MANIFEST = resolve(__dir, ".qa-ops-only-manifest.json");
const RH_ID = "0aee9ad0-5a5e-4532-8b86-95b801f8ee88";
const SALA_RH_ID = "b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815";
const EMAIL = "qa-rh-verify-opsonly@saletse-test.com";
const API = "http://187.77.14.148/api/v1";

const env = Object.fromEntries(
  readFileSync(resolve(__dir, "..", ".env.local"), "utf8").split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }),
);

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const pgC = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pgC.connect();
const q = (sql, p = []) => pgC.query(sql, p);
const m = { ids: {} };

async function token(email) {
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
  return s.session.access_token;
}

// Cleanup previo
await q(`DELETE FROM paquetes_acceso WHERE empresa_id = $1 AND slug = 'qa-ops-only-p0'`, [RH_ID]);
await q(`DELETE FROM roles WHERE empresa_id = $1 AND slug = 'qa-ops-only-p0'`, [RH_ID]);
const { rows: oldProf } = await q(`SELECT id FROM profiles WHERE email = $1`, [EMAIL]);
if (oldProf[0]) {
  await q(`DELETE FROM workspace_miembros WHERE usuario_id = $1`, [oldProf[0].id]);
  await q(`DELETE FROM empresa_miembros WHERE usuario_id = $1`, [oldProf[0].id]);
  await admin.auth.admin.deleteUser(oldProf[0].id).catch(() => {});
}
const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
let uid = list.users.find((u) => u.email === EMAIL)?.id;
if (!uid) {
  const { data } = await admin.auth.admin.createUser({ email: EMAIL, email_confirm: true, user_metadata: { full_name: "QA Ops Only" } });
  uid = data.user.id;
}
m.ids.user_id = uid;

await q(`INSERT INTO empresa_miembros (empresa_id, usuario_id, es_admin, estado) VALUES ($1,$2,false,'activo') ON CONFLICT DO NOTHING`, [RH_ID, uid]);

const pkgId = randomUUID();
const roleId = randomUUID();
m.ids.paquete_id = pkgId;
m.ids.role_id = roleId;

await q(`INSERT INTO paquetes_acceso (id, empresa_id, nombre, slug, activo) VALUES ($1,$2,'QA Ops Only P0','qa-ops-only-p0',true)`, [pkgId, RH_ID]);
await q(`INSERT INTO roles (id, slug, nombre, scope, empresa_id, paquete_id) VALUES ($1,'qa-ops-only-p0','QA Ops Only P0','workspace',$2,$3)`, [roleId, RH_ID, pkgId]);

const flagOps = (await q(`SELECT (flag_row_for_empresa('rh.tool.ops',$1)).id id`, [RH_ID])).rows[0].id;
const flagDias = (await q(`SELECT (flag_row_for_empresa('rh.tool.dias_descanso',$1)).id id`, [RH_ID])).rows[0].id;
const flagWsRh = (await q(`SELECT (flag_row_for_empresa('worksheet.royal_holiday',$1)).id id`, [RH_ID])).rows[0].id;
const flagWs = (await q(`SELECT (flag_row_for_empresa('worksheet',$1)).id id`, [RH_ID])).rows[0].id;
await q(
  `INSERT INTO paquete_flags (paquete_id, flag_id, activo) VALUES ($1,$2,true),($1,$3,true),($1,$4,true),($1,$5,false)`,
  [pkgId, flagWs, flagWsRh, flagOps, flagDias],
);

await q(`INSERT INTO workspace_miembros (usuario_id, workspace_id, rol_en_workspace, role_id) VALUES ($1,$2,'vendedor',$3)
  ON CONFLICT (usuario_id, workspace_id) DO UPDATE SET role_id = EXCLUDED.role_id`, [uid, SALA_RH_ID, roleId]);
await q(`UPDATE profiles SET workspace_activo_id = $1 WHERE id = $2`, [SALA_RH_ID, uid]);

const { rows: dia } = await q(
  `INSERT INTO rh_dias_descanso (empresa_id, workspace_id, usuario_id, fecha, tipo, notas)
   VALUES ($1,$2,$3,'2099-07-01','descanso','QA ops-only probe') RETURNING id`,
  [RH_ID, SALA_RH_ID, uid],
);
m.ids.dia_id = dia[0].id;

const resolved = (await q(
  `SELECT resolver_workspace_flag('rh.tool.ops',$1,$2) ops, resolver_workspace_flag('rh.tool.dias_descanso',$1,$2) dias`,
  [uid, SALA_RH_ID],
)).rows[0];
console.log("Flags resueltos:", resolved);

writeFileSync(MANIFEST, JSON.stringify(m, null, 2));

const t = await token(EMAIL);
const res = await fetch(`${API}/royal-holiday/${RH_ID}/dias-descanso?workspaceId=${SALA_RH_ID}`, {
  headers: { Authorization: `Bearer ${t}` },
});
const body = await res.json();
console.log("\nPRUEBA B resultado:");
console.log(`  HTTP ${res.status}`);
console.log(`  error: ${body.error || "—"}`);
console.log(`  registros: ${Array.isArray(body.data) ? body.data.length : "n/a"}`);
if (Array.isArray(body.data)) console.log(`  ids: ${body.data.map((d) => d.id.slice(0, 8)).join(", ")}`);

// Cleanup
await q(`DELETE FROM rh_dias_descanso WHERE id = $1`, [m.ids.dia_id]);
await q(`DELETE FROM workspace_miembros WHERE usuario_id = $1`, [uid]);
await q(`DELETE FROM empresa_miembros WHERE usuario_id = $1`, [uid]);
await q(`DELETE FROM roles WHERE id = $1`, [roleId]);
await q(`DELETE FROM paquetes_acceso WHERE id = $1`, [pkgId]);
await admin.auth.admin.deleteUser(uid);
unlinkSync(MANIFEST);
await pgC.end();
console.log("\nLimpieza ops-only OK");
