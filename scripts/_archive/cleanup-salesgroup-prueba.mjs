/**
 * Limpieza adicional: salesgroup + salesroom1 + prueba@hola.com
 * Uso: node scripts/cleanup-salesgroup-prueba.mjs --confirm
 */
import { readFileSync, existsSync, writeFileSync, appendFileSync } from "fs";
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
const KEEP_EMAILS = new Set([
  "eduardolalito99@hotmail.com",
  "santvalero8@gmail.com",
  "azaheljared@hotmail.com",
  "chriissua@gmail.com",
  "ela.ruizm@gmail.com",
  "cuentapremium4minecrafted@gmail.com",
  "michell.ruiz.t@gmail.com",
]);

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
    } catch { /* ignore */ }
    if (err.code === "42P01" || err.code === "42703") {
      console.warn("skip:", err.message.split("\n")[0]);
      return { rowCount: 0, rows: [] };
    }
    throw err;
  }
}

const { data: empresas } = await admin.from("empresas").select("id, nombre").ilike("nombre", "salesgroup");
const { data: salas } = await admin.from("workspaces").select("id, nombre, tipo, empresa_id").eq("tipo", "sala_de_venta");
const targetEmpresas = empresas || [];
const targetEmpresaIds = targetEmpresas.map((e) => e.id);
const targetSalas = (salas || []).filter(
  (s) => targetEmpresaIds.includes(s.empresa_id) || /^salesroom/i.test(String(s.nombre || "")),
);
const targetSalaIds = targetSalas.map((s) => s.id);

const { data: prueba } = await admin
  .from("profiles")
  .select("id, email, full_name, is_super_admin")
  .eq("email", "prueba@hola.com")
  .maybeSingle();

if (prueba?.is_super_admin) {
  console.error("ABORT: prueba@hola.com es superadmin — no se toca");
  process.exit(1);
}

const deleteUserIds = prueba ? [prueba.id] : [];

const snapshot = {
  at: new Date().toISOString(),
  empresas: targetEmpresas,
  salas: targetSalas,
  users: prueba ? [prueba] : [],
  keep_emails: [...KEEP_EMAILS],
};
writeFileSync(resolve(root, "docs/limpieza-salesgroup-prueba-backup.json"), JSON.stringify(snapshot, null, 2));
console.log(JSON.stringify({ dry_run: !CONFIRM, ...snapshot }, null, 2));

if (!CONFIRM) {
  console.log("Dry-run. Ejecuta: node scripts/cleanup-salesgroup-prueba.mjs --confirm");
  process.exit(0);
}

const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query("begin");
  await client.query("set local session_replication_role = replica");

  let personalIds = [];
  if (deleteUserIds.length) {
    const per = await q(
      client,
      `select distinct w.id from public.workspaces w
       join public.workspace_miembros wm on wm.workspace_id = w.id
       where w.tipo = 'personal' and wm.usuario_id = any($1::uuid[])`,
      [deleteUserIds],
    );
    personalIds = per.rows.map((r) => r.id);
  }
  const wsToWipe = [...new Set([...targetSalaIds, ...personalIds])];

  if (wsToWipe.length) {
    await q(client, `update public.profiles set workspace_activo_id = null where workspace_activo_id = any($1::uuid[])`, [wsToWipe]);
  }
  if (targetEmpresaIds.length) {
    await q(client, `delete from public.empresa_miembros where empresa_id = any($1::uuid[])`, [targetEmpresaIds]);
  }
  if (wsToWipe.length) {
    await q(client, `delete from public.prospect_workflow_events where workspace_id = any($1::uuid[]) or prospect_id in (select id from public.prospects where workspace_id = any($1::uuid[]))`, [wsToWipe]);
    await q(client, `delete from public.prospect_workflows where workspace_id = any($1::uuid[])`, [wsToWipe]);
    await q(client, `delete from public.chat_messages where conversation_id in (select id from public.chat_conversations where workspace_id = any($1::uuid[]))`, [wsToWipe]);
    await q(client, `delete from public.chat_members where conversation_id in (select id from public.chat_conversations where workspace_id = any($1::uuid[]))`, [wsToWipe]);
    await q(client, `delete from public.chat_conversations where workspace_id = any($1::uuid[])`, [wsToWipe]);
    await q(client, `delete from public.prospect_archivos where prospect_id in (select id from public.prospects where workspace_id = any($1::uuid[]))`, [wsToWipe]);
    await q(client, `delete from public.prospect_shares where prospect_id in (select id from public.prospects where workspace_id = any($1::uuid[]))`, [wsToWipe]);
    await q(client, `delete from public.prospect_share_invites where prospect_id in (select id from public.prospects where workspace_id = any($1::uuid[]))`, [wsToWipe]);
    await q(client, `delete from public.sales where prospect_id in (select id from public.prospects where workspace_id = any($1::uuid[]))`, [wsToWipe]);
    await q(client, `delete from public.prospects where workspace_id = any($1::uuid[])`, [wsToWipe]);
    await q(client, `delete from public.workspace_miembros where workspace_id = any($1::uuid[])`, [wsToWipe]);
    await q(client, `delete from public.workspaces where id = any($1::uuid[])`, [wsToWipe]);
  }

  if (targetEmpresaIds.length) {
    await q(client, `delete from public.workspaces where empresa_id = any($1::uuid[])`, [targetEmpresaIds]);
    await q(client, `delete from public.rol_permisos where rol_id in (select id from public.roles where empresa_id = any($1::uuid[]))`, [targetEmpresaIds]);
    await q(client, `delete from public.roles where empresa_id = any($1::uuid[])`, [targetEmpresaIds]);
    await q(client, `delete from public.paquete_flags where paquete_id in (select id from public.paquetes_acceso where empresa_id = any($1::uuid[]))`, [targetEmpresaIds]);
    await q(client, `delete from public.paquetes_acceso where empresa_id = any($1::uuid[])`, [targetEmpresaIds]);
    await q(client, `delete from public.empresas where id = any($1::uuid[])`, [targetEmpresaIds]);
  }

  if (deleteUserIds.length) {
    await q(client, `update public.profiles set workspace_activo_id = null where id = any($1::uuid[])`, [deleteUserIds]);
    await q(client, `delete from public.workspace_miembros where usuario_id = any($1::uuid[])`, [deleteUserIds]);
    await q(client, `delete from public.empresa_miembros where usuario_id = any($1::uuid[])`, [deleteUserIds]);
    await q(client, `delete from public.chat_members where usuario_id = any($1::uuid[])`, [deleteUserIds]);
    await q(client, `delete from public.direct_messages where sender_id = any($1::uuid[]) or recipient_id = any($1::uuid[])`, [deleteUserIds]);
    await q(client, `delete from public.sales where user_id = any($1::uuid[])`, [deleteUserIds]);
    await q(client, `delete from public.prospect_workflow_events where prospect_id in (select id from public.prospects where user_id = any($1::uuid[]))`, [deleteUserIds]);
    await q(client, `delete from public.prospect_workflows where prospect_id in (select id from public.prospects where user_id = any($1::uuid[]))`, [deleteUserIds]);
    await q(client, `delete from public.prospects where user_id = any($1::uuid[])`, [deleteUserIds]);
    await q(client, `delete from public.activities where user_id = any($1::uuid[])`, [deleteUserIds]);
    await q(client, `delete from public.goals where user_id = any($1::uuid[])`, [deleteUserIds]);
    await q(client, `delete from public.membresias where usuario_id = any($1::uuid[])`, [deleteUserIds]);
    await q(client, `delete from public.flag_reglas where alcance = 'usuario' and alcance_id = any($1::uuid[])`, [deleteUserIds]);
    await q(client, `delete from public.push_subscriptions where user_id = any($1::uuid[])`, [deleteUserIds]);
    await q(client, `delete from public.migracion_vendedor_liner_backup where usuario_id = any($1::uuid[])`, [deleteUserIds]);
    await q(client, `delete from public.logs_administracion where usuario_id = any($1::uuid[]) or entidad_id = any($1::uuid[])`, [deleteUserIds]);
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
if (prueba) {
  const { error } = await admin.auth.admin.deleteUser(prueba.id);
  if (error) {
    authErrors.push(error.message);
    await admin.from("profiles").delete().eq("id", prueba.id);
  } else deletedAuth = 1;
}

const { data: leftProfiles } = await admin.from("profiles").select("email, full_name, is_super_admin");
const { data: leftEmpresas } = await admin.from("empresas").select("id, nombre");
const { data: leftSalas } = await admin.from("workspaces").select("id, nombre, tipo").eq("tipo", "sala_de_venta");

const result = {
  deleted_auth_users: deletedAuth,
  auth_errors: authErrors,
  remaining_profiles: leftProfiles,
  remaining_empresas: leftEmpresas,
  remaining_salas: leftSalas,
};
console.log(JSON.stringify(result, null, 2));
writeFileSync(resolve(root, "docs/limpieza-salesgroup-prueba-resultado.json"), JSON.stringify(result, null, 2));
appendFileSync(
  resolve(root, "docs/limpieza-datos-prueba.md"),
  `\n\n## Segunda pasada (salesgroup + prueba@hola.com)\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`\n`,
);
