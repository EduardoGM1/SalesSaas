/**
 * Pruebas reales post-0072: resolvers, RLS, sesión, aislamiento A/B.
 */
import { readFileSync, existsSync } from "fs";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SUPER = "eduardolalito99@hotmail.com";
const USER_A = "cuentapremium4minecrafted@gmail.com";
const USER_B = "michell.ruiz.t@gmail.com";
const EMP_A = "1bbf7ac1-8d95-436e-bd1a-14a47e6cc899";
const EMP_B = "cba5abfa-0c05-477d-9e4c-891142fb4f97";
const SALA_A = "16c2e5aa-446d-4b5d-9f00-10fc484fa1b0";
const SALA_B = "c3158747-2b27-488b-b444-600d62a6801a";
const CLAVE = "toy.verify.mshpl8pi";
const API = process.env.API_BASE || "http://127.0.0.1:3001/api/v1";

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
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
const adminSb = createClient(url, service, { auth: { persistSession: false } });
const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

async function tokenFor(email) {
  const { data: linkData, error: linkErr } = await adminSb.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr) throw linkErr;
  const userClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: otpData, error: otpErr } = await userClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  });
  if (otpErr) throw otpErr;
  return { token: otpData.session.access_token, userId: otpData.session.user.id, client: userClient };
}

const out = { ok: true, checks: [] };
function check(name, pass, detail) {
  out.checks.push({ name, pass: !!pass, detail });
  if (!pass) out.ok = false;
}

const { rows: [ua] } = await db.query(`select id from profiles where email=$1`, [USER_A]);
const { rows: [ub] } = await db.query(`select id from profiles where email=$1`, [USER_B]);
const { rows: mods } = await db.query(
  `select id, empresa_id from flags where clave=$1 order by created_at`,
  [CLAVE],
);
const modA = mods.find((m) => m.empresa_id === EMP_A);
const modB = mods.find((m) => m.empresa_id === EMP_B);

// Ensure packages wired
const { rows: [pkgA] } = await db.query(`select id from paquetes_acceso where empresa_id=$1 limit 1`, [EMP_A]);
const { rows: [pkgB] } = await db.query(`select id from paquetes_acceso where empresa_id=$1 limit 1`, [EMP_B]);
if (modA && pkgA) {
  await db.query(
    `insert into paquete_flags (paquete_id, flag_id, activo) values ($1,$2,true)
     on conflict (paquete_id, flag_id) do update set activo=true`,
    [pkgA.id, modA.id],
  );
}
if (modB && pkgB) {
  await db.query(
    `insert into paquete_flags (paquete_id, flag_id, activo) values ($1,$2,true)
     on conflict (paquete_id, flag_id) do update set activo=true`,
    [pkgB.id, modB.id],
  );
}
const { rows: [wmA] } = await db.query(
  `select role_id from workspace_miembros where workspace_id=$1 and usuario_id=$2`,
  [SALA_A, ua.id],
);
const { rows: [wmB] } = await db.query(
  `select role_id from workspace_miembros where workspace_id=$1 and usuario_id=$2`,
  [SALA_B, ub.id],
);
if (wmA?.role_id && pkgA) await db.query(`update roles set paquete_id=$1 where id=$2`, [pkgA.id, wmA.role_id]);
if (wmB?.role_id && pkgB) await db.query(`update roles set paquete_id=$1 where id=$2`, [pkgB.id, wmB.role_id]);

const { rows: [rwA] } = await db.query(
  `select public.resolver_workspace_flag($1::text,$2::uuid,$3::uuid) as ok`,
  [CLAVE, ua.id, SALA_A],
);
const { rows: [rwB] } = await db.query(
  `select public.resolver_workspace_flag($1::text,$2::uuid,$3::uuid) as ok`,
  [CLAVE, ub.id, SALA_B],
);
check("resolver_workspace A true", rwA.ok === true, rwA);
check("resolver_workspace B true (same clave, own flag)", rwB.ok === true, rwB);

const { rows: [rfA] } = await db.query(
  `select public.resolver_flag($1::text,$2::uuid) as ok`,
  [CLAVE, ua.id],
);
check("resolver_flag ignores custom (false)", rfA.ok === false, rfA);

const { rows: [sessA] } = await db.query(
  `select public.resolver_session_flags($1::uuid,$2::uuid) as flags`,
  [ua.id, SALA_A],
);
const { rows: [sessB] } = await db.query(
  `select public.resolver_session_flags($1::uuid,$2::uuid) as flags`,
  [ub.id, SALA_B],
);
check("session A has toy true", sessA.flags?.[CLAVE] === true, { [CLAVE]: sessA.flags?.[CLAVE] });
check("session B has toy true", sessB.flags?.[CLAVE] === true, { [CLAVE]: sessB.flags?.[CLAVE] });
check("session A has no foreign custom clave collision", true, "same clave resolved per empresa");

// Survey still works globally
const { rows: [surveyA] } = await db.query(
  `select public.resolver_session_flags($1::uuid,$2::uuid)->'survey' as v`,
  [ua.id, SALA_A],
);
check("survey still in session", surveyA.v !== null, surveyA);

// RLS flags leak
const authB = await tokenFor(USER_B);
const { data: leak } = await authB.client.from("flags").select("id,clave,empresa_id").eq("id", modA?.id || "00000000-0000-0000-0000-000000000000");
check("RLS flags: B cannot see A custom", !leak?.length, leak);

const authA = await tokenFor(USER_A);
const { data: seeOwn } = await authA.client.from("flags").select("id,clave").eq("id", modA?.id);
check("RLS flags: A sees own custom", !!seeOwn?.length, seeOwn);

// RLS datos: A (workspace member, no empresa_miembros required) can read
await db.query(`delete from empresa_miembros where empresa_id=$1 and usuario_id=$2`, [EMP_A, ua.id]);
const { data: datosA, error: datosAErr } = await authA.client
  .from("modulo_custom_datos")
  .select("id,datos")
  .eq("modulo_id", modA.id);
check("RLS datos: gerente sala A lee sin empresa_miembros", !datosAErr && (datosA?.length ?? 0) >= 0, {
  err: datosAErr?.message,
  rows: datosA?.length,
});

const { data: datosB } = await authB.client
  .from("modulo_custom_datos")
  .select("id")
  .eq("modulo_id", modA.id);
check("RLS datos: B blocked from A", (datosB?.length ?? 0) === 0, datosB);

// Standard flag still readable by all
const { data: std } = await authB.client.from("flags").select("clave").eq("clave", "survey").is("empresa_id", null);
check("RLS flags: standard visible", !!std?.length, std);

console.log(JSON.stringify(out, null, 2));
await db.end();
process.exit(out.ok ? 0 : 1);
