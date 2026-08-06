/**
 * Verificación end-to-end: empresas test + módulo custom exclusivo + aislamiento.
 * Usa flujo API real (Auth magiclink Superadmin).
 */
import { readFileSync, existsSync } from "fs";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SUPER = "eduardolalito99@hotmail.com";
const USER_A = "cuentapremium4minecrafted@gmail.com"; // Gerente existing or member
const USER_B = "michell.ruiz.t@gmail.com";
const API = process.env.API_BASE || "https://saletse.vercel.app/api/v1";

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

async function api(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, json, text: text.slice(0, 300) };
}

const db = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await db.connect();

const report = { steps: [] };

// --- Schema facts ---
const { rows: flagPol } = await db.query(`
  select polname, pg_get_expr(polqual, polrelid) as using_expr
  from pg_policy where polrelid = 'public.flags'::regclass
`);
const { rows: [rf] } = await db.query(
  `select pg_get_functiondef('public.resolver_flag(text,uuid)'::regprocedure) as d`,
);
report.flags_policy = flagPol;
report.resolver_flag_filters_empresa = /empresa_id/i.test(rf.d);
report.resolver_flag_where_clave_only = /from\s+public\.flags\s+where\s+clave\s*=/i.test(rf.d);

let rws = null;
try {
  const { rows } = await db.query(
    `select pg_get_functiondef('public.resolver_workspace_flag(text,uuid,uuid)'::regprocedure) as d`,
  );
  rws = rows[0]?.d;
} catch { /* */ }
report.resolver_workspace_flag_exists = Boolean(rws);
report.resolver_workspace_flag_filters_empresa = rws ? /empresa_id/i.test(rws) : false;

const { rows: alcanceCheck } = await db.query(`
  select pg_get_constraintdef(oid) as def from pg_constraint
  where conrelid='public.flag_reglas'::regclass and conname='flag_reglas_alcance_check'
`);
report.flag_reglas_alcance = alcanceCheck[0]?.def;

// --- Auth superadmin ---
const superAuth = await tokenFor(SUPER);
report.steps.push({ step: "auth_super", ok: Boolean(superAuth.token) });

// Profile ids for gerentes
const { rows: [ua] } = await db.query(`select id, email from profiles where email=$1`, [USER_A]);
const { rows: [ub] } = await db.query(`select id, email from profiles where email=$1`, [USER_B]);
report.users = { A: ua, B: ub };

const stamp = Date.now().toString(36);
const nameA = `Empresa Test A ${stamp}`;
const nameB = `Empresa Test B ${stamp}`;

// Create empresas via Admin API
const createA = await api(superAuth.token, "POST", "/admin/empresas", { nombre: nameA });
const createB = await api(superAuth.token, "POST", "/admin/empresas", { nombre: nameB });
report.create_empresa_A = { status: createA.status, id: createA.json?.data?.id || createA.json?.id, error: createA.json?.error, body: createA.text };
report.create_empresa_B = { status: createB.status, id: createB.json?.data?.id || createB.json?.id, error: createB.json?.error, body: createB.text };

const empA = report.create_empresa_A.id;
const empB = report.create_empresa_B.id;

if (!empA || !empB) {
  console.log(JSON.stringify(report, null, 2));
  await db.end();
  process.exit(1);
}

// Check seed roles after create (no duplicates)
async function roleAudit(empresaId, label) {
  const { rows } = await db.query(
    `select slug, count(*)::int as n,
            (select count(*)::int from rol_permisos rp where rp.rol_id = r.id) as perms
     from roles r
     where empresa_id = $1 and slug in ('gerente','liner','cerrador','asistente_sala','asistente_empresa')
     group by id, slug
     order by slug`,
    [empresaId],
  );
  const { rows: [dup] } = await db.query(
    `select count(*)::int as n from (
       select slug from roles where empresa_id=$1 group by slug having count(*)>1
     ) d`,
    [empresaId],
  );
  return { label, roles: rows, duplicate_slugs: dup.n };
}
report.seed_A = await roleAudit(empA, "A");
report.seed_B = await roleAudit(empB, "B");

// Create salas via Admin Superadmin flow (POST /admin/salas)
const salaARes = await api(superAuth.token, "POST", "/admin/salas", {
  empresa_id: empA,
  nombre: `Sala A ${stamp}`,
  gerente_id: ua.id,
});
const salaBRes = await api(superAuth.token, "POST", "/admin/salas", {
  empresa_id: empB,
  nombre: `Sala B ${stamp}`,
  gerente_id: ub.id,
});

report.create_sala_A = { status: salaARes.status, id: salaARes.json?.data?.id || salaARes.json?.id, error: salaARes.json?.error, text: salaARes.text };
report.create_sala_B = { status: salaBRes.status, id: salaBRes.json?.data?.id || salaBRes.json?.id, error: salaBRes.json?.error, text: salaBRes.text };

// Re-check seed after sala (idempotent, no dups)
report.seed_A_after_sala = await roleAudit(empA, "A_after_sala");
report.seed_B_after_sala = await roleAudit(empB, "B_after_sala");

// Create custom module for A via API
const modClave = `toy.verify.${stamp}`;
const createMod = await api(superAuth.token, "POST", `/admin/tenant/empresas/${empA}/modulos-custom`, {
  clave: modClave,
  nombre_visible: "Módulo Toy Verificación A",
  punto_extension: "expediente.tab",
  schema_ui: { fields: [{ key: "nota", type: "text", label: "Nota" }] },
});
report.create_modulo_A = {
  status: createMod.status,
  id: createMod.json?.data?.id || createMod.json?.id,
  error: createMod.json?.error,
  text: createMod.text,
};
const modId = report.create_modulo_A.id;

// List flags for A and B via API
const listA = await api(superAuth.token, "GET", `/admin/tenant/empresas/${empA}/modulos-custom`);
const listB = await api(superAuth.token, "GET", `/admin/tenant/empresas/${empB}/modulos-custom`);
const flagsA = listA.json?.data || listA.json || [];
const flagsB = listB.json?.data || listB.json || [];
const toyInA = Array.isArray(flagsA) && flagsA.some((f) => f.clave === modClave || f.id === modId);
const toyInB = Array.isArray(flagsB) && flagsB.some((f) => f.clave === modClave || f.id === modId);
report.list_modulos = {
  statusA: listA.status,
  statusB: listB.status,
  toyInA,
  toyInB,
  countA: Array.isArray(flagsA) ? flagsA.length : null,
  countB: Array.isArray(flagsB) ? flagsB.length : null,
  errorA: listA.json?.error,
  errorB: listB.json?.error,
};

// Direct SQL: flag row ownership
if (modId) {
  const { rows: [flagRow] } = await db.query(
    `select id, clave, tipo, empresa_id, default_global from flags where id=$1`,
    [modId],
  );
  report.flag_row = flagRow;

  // Upsert datos for A
  const upsertDatos = await api(superAuth.token, "PUT", `/admin/tenant/empresas/${empA}/modulos-custom/${modId}/datos`, {
    entidad_relacionada_id: null,
    datos: { nota: "solo-empresa-A", secret: "xyz" },
  });
  report.upsert_datos_A = { status: upsertDatos.status, error: upsertDatos.json?.error, id: upsertDatos.json?.data?.id || upsertDatos.json?.id };

  // Try read datos as B empresa admin path (should 403 or empty)
  const listDatosB = await api(superAuth.token, "GET", `/admin/tenant/empresas/${empB}/modulos-custom/${modId}/datos`);
  report.list_datos_as_B_empresa = { status: listDatosB.status, error: listDatosB.json?.error, data: listDatosB.json?.data ?? listDatosB.json };

  // RLS as user B (JWT) reading modulo_custom_datos
  const authB = await tokenFor(USER_B);
  const { data: rlsB, error: rlsBErr } = await authB.client
    .from("modulo_custom_datos")
    .select("id, empresa_id, datos")
    .eq("modulo_id", modId);
  report.rls_user_B_select_datos = {
    error: rlsBErr?.message || null,
    rows: rlsB?.length ?? null,
    sample: rlsB?.[0] || null,
  };

  // RLS as user A
  const authA = await tokenFor(USER_A);
  // ensure A is empresa member of A
  const { rows: memA } = await db.query(
    `select * from empresa_miembros where empresa_id=$1 and usuario_id=$2`,
    [empA, ua.id],
  );
  report.empresa_miembro_A = memA[0] || null;

  const { data: rlsA, error: rlsAErr } = await authA.client
    .from("modulo_custom_datos")
    .select("id, empresa_id, datos")
    .eq("modulo_id", modId);
  report.rls_user_A_select_datos = {
    error: rlsAErr?.message || null,
    rows: rlsA?.length ?? null,
    sample: rlsA?.[0] || null,
  };

  // resolver_flag for custom clave as A and B
  const { rows: [resA] } = await db.query(
    `select public.resolver_flag($1::text, $2::uuid) as ok`,
    [modClave, ua.id],
  );
  const { rows: [resB] } = await db.query(
    `select public.resolver_flag($1::text, $2::uuid) as ok`,
    [modClave, ub.id],
  );
  report.resolver_flag_toy = { userA: resA.ok, userB: resB.ok, note: "default_global=false → false unless reglas" };

  // Ambiguity test: same clave for B
  const createModB = await api(superAuth.token, "POST", `/admin/tenant/empresas/${empB}/modulos-custom`, {
    clave: modClave,
    nombre_visible: "Módulo Toy Verificación B same clave",
    punto_extension: "expediente.tab",
    schema_ui: { fields: [] },
  });
  report.create_modulo_B_same_clave = {
    status: createModB.status,
    id: createModB.json?.data?.id || createModB.json?.id,
    error: createModB.json?.error,
  };

  if (report.create_modulo_B_same_clave.id) {
    // How many rows for same clave?
    const { rows: sameClave } = await db.query(
      `select id, empresa_id, tipo from flags where clave=$1`,
      [modClave],
    );
    report.same_clave_rows = sameClave;
    // resolver_flag with ambiguous clave
    try {
      const { rows: [amb] } = await db.query(
        `select public.resolver_flag($1::text, $2::uuid) as ok`,
        [modClave, ua.id],
      );
      report.resolver_flag_ambiguous = { ok: amb.ok, error: null };
    } catch (e) {
      report.resolver_flag_ambiguous = { ok: null, error: e.message };
    }
  }
}

// Platform roles unchanged (no dup)
const { rows: platformRoles } = await db.query(
  `select slug, count(*)::int as n from roles where empresa_id is null group by slug order by 1`,
);
report.platform_roles = platformRoles;

console.log(JSON.stringify(report, null, 2));
await db.end();
