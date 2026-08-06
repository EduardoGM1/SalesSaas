/**
 * Checks adicionales: paquetes, leak flags RLS, membresía gerente, activación paquete.
 */
import { readFileSync, existsSync } from "fs";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const USER_A = "cuentapremium4minecrafted@gmail.com";
const USER_B = "michell.ruiz.t@gmail.com";
const EMP_A = "1bbf7ac1-8d95-436e-bd1a-14a47e6cc899";
const EMP_B = "cba5abfa-0c05-477d-9e4c-891142fb4f97";
const MOD_A = "1cac8c13-5dba-4d18-8373-a051c3cbb0ae";
const CLAVE = "toy.verify.mshpl8pi";
const SALA_A = "16c2e5aa-446d-4b5d-9f00-10fc484fa1b0";
const SALA_B = "c3158747-2b27-488b-b444-600d62a6801a";

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
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
const adminSb = createClient(url, service, { auth: { persistSession: false } });

async function tokenFor(email) {
  const { data: linkData, error: linkErr } = await adminSb.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr) throw linkErr;
  const userClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: otpData, error: otpErr } = await userClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  });
  if (otpErr) throw otpErr;
  return { token: otpData.session.access_token, userId: otpData.session.user.id, client: userClient };
}

const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const out = {};

// paquetes_acceso schema
const { rows: cols } = await db.query(`
  select column_name, data_type, is_nullable
  from information_schema.columns
  where table_schema='public' and table_name='paquetes_acceso'
  order by ordinal_position
`);
out.paquetes_acceso_cols = cols;
const { rows: paquetes } = await db.query(
  `select id, empresa_id, nombre, activo from paquetes_acceso where empresa_id in ($1,$2) or true order by empresa_id nulls first limit 20`,
  [EMP_A, EMP_B],
);
out.paquetes_sample = paquetes;

const { rows: pkgByEmp } = await db.query(
  `select empresa_id, count(*)::int as n from paquetes_acceso group by empresa_id`,
);
out.paquetes_por_empresa = pkgByEmp;

// Does createSala create empresa_miembros for gerente?
const { rows: mems } = await db.query(
  `select empresa_id, usuario_id, es_admin, estado from empresa_miembros where empresa_id in ($1,$2)`,
  [EMP_A, EMP_B],
);
out.empresa_miembros_AB = mems;

const { rows: wmems } = await db.query(
  `select workspace_id, usuario_id, role_id, rol_en_workspace from workspace_miembros where workspace_id in ($1,$2)`,
  [SALA_A, SALA_B],
);
out.workspace_miembros_AB = wmems;

// flags leak: user B can see custom flag of A?
const authB = await tokenFor(USER_B);
const { data: leakFlags, error: leakErr } = await authB.client
  .from("flags")
  .select("id, clave, tipo, empresa_id, nombre_visible")
  .eq("id", MOD_A);
out.flags_rls_leak_B_sees_A_module = {
  error: leakErr?.message || null,
  rows: leakFlags?.length ?? null,
  sample: leakFlags?.[0] || null,
};

// Activate toy for empresa A via paquete_flags on a package of A (create package if needed)
let { rows: [pkgA] } = await db.query(
  `select id from paquetes_acceso where empresa_id=$1 limit 1`,
  [EMP_A],
);
if (!pkgA) {
  const { rows: [created] } = await db.query(
    `insert into paquetes_acceso (empresa_id, nombre, activo) values ($1, 'Plan Test A', true) returning id`,
    [EMP_A],
  );
  pkgA = created;
}
out.pkg_A = pkgA;

await db.query(
  `insert into paquete_flags (paquete_id, flag_id, activo)
   values ($1, $2, true)
   on conflict (paquete_id, flag_id) do update set activo = true`,
  [pkgA.id, MOD_A],
);

// Attach gerente role of sala A to this package
const { rows: [ua] } = await db.query(`select id from profiles where email=$1`, [USER_A]);
const { rows: [ub] } = await db.query(`select id from profiles where email=$1`, [USER_B]);
const { rows: [wmA] } = await db.query(
  `select role_id from workspace_miembros where workspace_id=$1 and usuario_id=$2`,
  [SALA_A, ua.id],
);
if (wmA?.role_id) {
  await db.query(`update roles set paquete_id=$1 where id=$2`, [pkgA.id, wmA.role_id]);
  out.role_A_paquete = { role_id: wmA.role_id, paquete_id: pkgA.id };
}

// resolver_workspace_flag for A and B
const { rows: [rwA] } = await db.query(
  `select public.resolver_workspace_flag($1::text, $2::uuid, $3::uuid) as ok`,
  [CLAVE, ua.id, SALA_A],
);
const { rows: [rwB] } = await db.query(
  `select public.resolver_workspace_flag($1::text, $2::uuid, $3::uuid) as ok`,
  [CLAVE, ub.id, SALA_B],
);
out.resolver_workspace_flag = { userA_salaA: rwA.ok, userB_salaB: rwB.ok };

// Ambiguity: which flag_id does resolver pick when same clave?
const { rows: pick } = await db.query(
  `select id, empresa_id from flags where clave=$1 order by created_at`,
  [CLAVE],
);
out.same_clave_order = pick;
// Force check: if B's package has B's same-clave module active, does A's resolution break?
let { rows: [pkgB] } = await db.query(`select id from paquetes_acceso where empresa_id=$1 limit 1`, [EMP_B]);
if (!pkgB) {
  const { rows: [created] } = await db.query(
    `insert into paquetes_acceso (empresa_id, nombre, activo) values ($1, 'Plan Test B', true) returning id`,
    [EMP_B],
  );
  pkgB = created;
}
const { rows: [modB] } = await db.query(
  `select id from flags where empresa_id=$1 and clave=$2`,
  [EMP_B, CLAVE],
);
await db.query(
  `insert into paquete_flags (paquete_id, flag_id, activo) values ($1,$2,true)
   on conflict (paquete_id, flag_id) do update set activo=true`,
  [pkgB.id, modB.id],
);
const { rows: [wmB] } = await db.query(
  `select role_id from workspace_miembros where workspace_id=$1 and usuario_id=$2`,
  [SALA_B, ub.id],
);
if (wmB?.role_id) {
  await db.query(`update roles set paquete_id=$1 where id=$2`, [pkgB.id, wmB.role_id]);
}
const { rows: [rwA2] } = await db.query(
  `select public.resolver_workspace_flag($1::text, $2::uuid, $3::uuid) as ok`,
  [CLAVE, ua.id, SALA_A],
);
const { rows: [rwB2] } = await db.query(
  `select public.resolver_workspace_flag($1::text, $2::uuid, $3::uuid) as ok`,
  [CLAVE, ub.id, SALA_B],
);
out.resolver_after_both_packages = { userA_salaA: rwA2.ok, userB_salaB: rwB2.ok };

// Which flag id does SELECT INTO pick? (simulate)
const { rows: [picked] } = await db.query(
  `select id, empresa_id from flags where clave=$1 limit 1`,
  [CLAVE],
);
out.limit1_pick = picked;

// RLS datos: make A empresa miembro and retest
await db.query(
  `insert into empresa_miembros (empresa_id, usuario_id, es_admin, estado)
   values ($1, $2, true, 'activo')
   on conflict do nothing`,
  [EMP_A, ua.id],
);
// Check unique constraint name
const { rows: emA } = await db.query(
  `select * from empresa_miembros where empresa_id=$1 and usuario_id=$2`,
  [EMP_A, ua.id],
);
out.empresa_miembro_A_after = emA[0] || null;

const authA = await tokenFor(USER_A);
const { data: datosA, error: datosAErr } = await authA.client
  .from("modulo_custom_datos")
  .select("id, empresa_id, datos")
  .eq("modulo_id", MOD_A);
out.rls_A_after_membership = { error: datosAErr?.message, rows: datosA?.length, sample: datosA?.[0] };

const { data: datosB2 } = await authB.client
  .from("modulo_custom_datos")
  .select("id, empresa_id, datos")
  .eq("modulo_id", MOD_A);
out.rls_B_still_blocked = { rows: datosB2?.length ?? null };

// flags table columns live
const { rows: flagCols } = await db.query(`
  select column_name, data_type from information_schema.columns
  where table_schema='public' and table_name='flags' order by ordinal_position
`);
out.flags_columns = flagCols;

console.log(JSON.stringify(out, null, 2));
await db.end();
