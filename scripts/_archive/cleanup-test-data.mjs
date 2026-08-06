/**
 * Limpia usuarios/empresas/salas de prueba.
 * Dominios: @test.saletse.com, @demo.salesapp.test, @salesapp.test, @qa.saletse.com
 * Empresas cuyo nombre contiene test|qa|demo
 *
 * Dry-run:  node scripts/cleanup-test-data.mjs
 * Ejecutar: node scripts/cleanup-test-data.mjs --confirm
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function loadEnv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}

const env = { ...loadEnv(resolve(root, ".env")), ...loadEnv(resolve(root, ".env.local")) };
const CONFIRM = process.env.CONFIRM === "1" || process.argv.includes("--confirm");
const TEST_EMAIL_RE = /@(test\.saletse\.com|demo\.salesapp\.test|salesapp\.test|qa\.saletse\.com)$/i;

const admin = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function q(client, sql, params = []) {
  const sp = `sp_${Math.random().toString(36).slice(2, 10)}`;
  try {
    await client.query(`savepoint ${sp}`);
    const res = await client.query(sql, params);
    await client.query(`release savepoint ${sp}`);
    return res;
  } catch (err) {
    try {
      await client.query(`rollback to savepoint ${sp}`);
      await client.query(`release savepoint ${sp}`);
    } catch {
      // ignore
    }
    if (err.code === "42P01" || err.code === "42703") {
      console.warn("skip:", err.message.split("\n")[0]);
      return { rowCount: 0, rows: [] };
    }
    throw err;
  }
}

const { data: allProfiles } = await admin.from("profiles").select("id, email, full_name, is_super_admin");
const testUsers = (allProfiles || []).filter((p) => TEST_EMAIL_RE.test(String(p.email || "")));
const keepUsers = (allProfiles || []).filter((p) => !TEST_EMAIL_RE.test(String(p.email || "")));
const testUserIds = testUsers.map((u) => u.id);

const { data: allEmpresas } = await admin.from("empresas").select("id, nombre, estado, created_at");
const testEmpresas = (allEmpresas || []).filter((e) => /test|qa|demo/i.test(String(e.nombre || "")));
const keepEmpresas = (allEmpresas || []).filter((e) => !testEmpresas.some((t) => t.id === e.id));
const testEmpresaIds = testEmpresas.map((e) => e.id);

const { data: allSalas } = await admin
  .from("workspaces")
  .select("id, nombre, tipo, empresa_id, empresas(nombre)")
  .eq("tipo", "sala_de_venta");
const testSalas = (allSalas || []).filter(
  (w) => testEmpresaIds.includes(w.empresa_id) || /test|qa|demo/i.test(String(w.nombre || "")),
);
const testSalaIds = testSalas.map((w) => w.id);

const snapshot = {
  at: new Date().toISOString(),
  test_users: testUsers,
  keep_users: keepUsers,
  test_empresas: testEmpresas,
  keep_empresas: keepEmpresas,
  test_salas: testSalas,
};
writeFileSync(resolve(root, "docs/limpieza-datos-prueba-backup.json"), JSON.stringify(snapshot, null, 2));

console.log(JSON.stringify({
  dry_run: !CONFIRM,
  delete_users: testUsers.map((u) => u.email),
  delete_empresas: testEmpresas.map((e) => e.nombre),
  delete_salas: testSalas.map((s) => `${s.nombre} (${s.empresas?.nombre || s.empresa_id})`),
  keep_users: keepUsers.map((u) => u.email),
  keep_empresas: keepEmpresas.map((e) => e.nombre),
}, null, 2));

if (!CONFIRM) {
  console.log("\nDry-run OK. Ejecuta: node scripts/cleanup-test-data.mjs --confirm");
  process.exit(0);
}

if (!env.DATABASE_URL) {
  console.error("DATABASE_URL requerido");
  process.exit(1);
}

const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query("begin");
  // Permite borrar historial append-only y FKs rígidas durante limpieza controlada
  await client.query("set local session_replication_role = replica");

  // Personal workspaces de usuarios test (antes de borrar membresías)
  let personalIds = [];
  if (testUserIds.length) {
    const per = await q(
      client,
      `select distinct w.id
       from public.workspaces w
       join public.workspace_miembros wm on wm.workspace_id = w.id
       where w.tipo = 'personal'
         and wm.usuario_id = any($1::uuid[])`,
      [testUserIds],
    );
    personalIds = per.rows.map((r) => r.id);
  }
  const wsToWipe = [...new Set([...testSalaIds, ...personalIds])];

  if (wsToWipe.length) {
    await q(client, `update public.profiles set workspace_activo_id = null where workspace_activo_id = any($1::uuid[])`, [wsToWipe]);
  }

  if (testEmpresaIds.length) {
    await q(client, `delete from public.empresa_miembros where empresa_id = any($1::uuid[])`, [testEmpresaIds]);
  }
  if (testSalaIds.length) {
    await q(client, `delete from public.workspace_miembros where workspace_id = any($1::uuid[])`, [testSalaIds]);
  }

  if (wsToWipe.length) {
    await q(client, `
      delete from public.prospect_workflow_events
      where prospect_id in (select id from public.prospects where workspace_id = any($1::uuid[]))
         or workspace_id = any($1::uuid[])
    `, [wsToWipe]);
    await q(client, `delete from public.prospect_workflows where workspace_id = any($1::uuid[])`, [wsToWipe]);
    await q(client, `
      delete from public.chat_messages
      where conversation_id in (select id from public.chat_conversations where workspace_id = any($1::uuid[]))
    `, [wsToWipe]);
    await q(client, `
      delete from public.chat_members
      where conversation_id in (select id from public.chat_conversations where workspace_id = any($1::uuid[]))
    `, [wsToWipe]);
    await q(client, `delete from public.chat_conversations where workspace_id = any($1::uuid[])`, [wsToWipe]);
    await q(client, `
      delete from public.prospect_archivos
      where prospect_id in (select id from public.prospects where workspace_id = any($1::uuid[]))
    `, [wsToWipe]);
    await q(client, `
      delete from public.prospect_shares
      where prospect_id in (select id from public.prospects where workspace_id = any($1::uuid[]))
    `, [wsToWipe]);
    await q(client, `
      delete from public.prospect_share_invites
      where prospect_id in (select id from public.prospects where workspace_id = any($1::uuid[]))
    `, [wsToWipe]);
    await q(client, `
      delete from public.sales
      where prospect_id in (select id from public.prospects where workspace_id = any($1::uuid[]))
    `, [wsToWipe]);
    await q(client, `delete from public.prospects where workspace_id = any($1::uuid[])`, [wsToWipe]);
    await q(client, `delete from public.workspace_miembros where workspace_id = any($1::uuid[])`, [wsToWipe]);
    await q(client, `delete from public.workspaces where id = any($1::uuid[])`, [wsToWipe]);
  }

  if (testEmpresaIds.length) {
    await q(client, `delete from public.workspaces where empresa_id = any($1::uuid[])`, [testEmpresaIds]);
    await q(client, `delete from public.rol_permisos where rol_id in (select id from public.roles where empresa_id = any($1::uuid[]))`, [testEmpresaIds]);
    await q(client, `delete from public.roles where empresa_id = any($1::uuid[])`, [testEmpresaIds]);
    await q(client, `delete from public.paquete_flags where paquete_id in (select id from public.paquetes_acceso where empresa_id = any($1::uuid[]))`, [testEmpresaIds]);
    await q(client, `delete from public.paquetes_acceso where empresa_id = any($1::uuid[])`, [testEmpresaIds]);
    await q(client, `delete from public.empresas where id = any($1::uuid[])`, [testEmpresaIds]);
  }

  if (testUserIds.length) {
    await q(client, `update public.profiles set workspace_activo_id = null where id = any($1::uuid[])`, [testUserIds]);
    await q(client, `delete from public.workspace_miembros where usuario_id = any($1::uuid[])`, [testUserIds]);
    await q(client, `delete from public.empresa_miembros where usuario_id = any($1::uuid[])`, [testUserIds]);
    await q(client, `delete from public.chat_members where usuario_id = any($1::uuid[])`, [testUserIds]);
    await q(client, `delete from public.direct_messages where sender_id = any($1::uuid[]) or recipient_id = any($1::uuid[])`, [testUserIds]);
    await q(client, `delete from public.sales where user_id = any($1::uuid[])`, [testUserIds]);
    await q(client, `
      delete from public.prospect_workflow_events
      where prospect_id in (select id from public.prospects where user_id = any($1::uuid[]))
    `, [testUserIds]);
    await q(client, `
      delete from public.prospect_workflows
      where prospect_id in (select id from public.prospects where user_id = any($1::uuid[]))
         or representante_id = any($1::uuid[])
         or gerente_id = any($1::uuid[])
         or cerrador_id = any($1::uuid[])
    `, [testUserIds]);
    await q(client, `delete from public.prospects where user_id = any($1::uuid[])`, [testUserIds]);
    await q(client, `delete from public.activities where user_id = any($1::uuid[])`, [testUserIds]);
    await q(client, `delete from public.agenda_entries where user_id = any($1::uuid[])`, [testUserIds]);
    await q(client, `delete from public.goals where user_id = any($1::uuid[])`, [testUserIds]);
    await q(client, `delete from public.membresias where usuario_id = any($1::uuid[])`, [testUserIds]);
    await q(client, `delete from public.flag_reglas where alcance = 'usuario' and alcance_id = any($1::uuid[])`, [testUserIds]);
    await q(client, `delete from public.push_subscriptions where user_id = any($1::uuid[])`, [testUserIds]);
    await q(client, `delete from public.user_presence where user_id = any($1::uuid[])`, [testUserIds]);
    await q(client, `delete from public.migracion_vendedor_liner_backup where usuario_id = any($1::uuid[])`, [testUserIds]);
    await q(client, `delete from public.logs_administracion where usuario_id = any($1::uuid[]) or entidad_id = any($1::uuid[])`, [testUserIds]);
  }

  await client.query("commit");
  console.log("SQL committed");
} catch (err) {
  await client.query("rollback");
  console.error("ROLLBACK:", err.message);
  await client.end();
  process.exit(1);
}
await client.end();

let deletedAuth = 0;
const authErrors = [];
for (const u of testUsers) {
  const { error } = await admin.auth.admin.deleteUser(u.id);
  if (error) {
    authErrors.push({ email: u.email, error: error.message });
    const { error: pErr } = await admin.from("profiles").delete().eq("id", u.id);
    if (pErr) authErrors.push({ email: u.email, profile_error: pErr.message });
  } else {
    deletedAuth += 1;
  }
}

const { data: leftProfiles } = await admin.from("profiles").select("id, email, full_name");
const leftTest = (leftProfiles || []).filter((p) => TEST_EMAIL_RE.test(String(p.email || "")));
const { data: leftEmpresas } = await admin.from("empresas").select("id, nombre");
const { data: leftSalas } = await admin.from("workspaces").select("id, nombre, tipo, empresa_id").eq("tipo", "sala_de_venta");

const result = {
  deleted_auth_users: deletedAuth,
  auth_errors: authErrors,
  remaining_test_emails: leftTest.map((p) => p.email),
  remaining_profiles: (leftProfiles || []).map((p) => ({ email: p.email, name: p.full_name })),
  remaining_empresas: leftEmpresas,
  remaining_salas: leftSalas,
};
console.log(JSON.stringify(result, null, 2));
writeFileSync(resolve(root, "docs/limpieza-datos-prueba-resultado.json"), JSON.stringify(result, null, 2));
