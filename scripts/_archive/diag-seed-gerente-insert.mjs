import { readFileSync, existsSync } from "fs";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
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
const gerenteId = "4cd9b226-57aa-42ad-a950-71d8d91ab2f6";
const linerPlatform = "a0000000-0000-4000-8000-000000000003";

const admin = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: basePerms, error: e1 } = await admin
  .from("rol_permisos")
  .select("permiso_id")
  .eq("rol_id", linerPlatform);
console.log("basePerms", basePerms?.length, e1);

const { data: existing, error: e2 } = await admin
  .from("rol_permisos")
  .select("permiso_id")
  .eq("rol_id", gerenteId);
console.log("existing gerente", existing?.length, e2);

const { data: wfPerms, error: e3 } = await admin
  .from("permisos")
  .select("id, clave")
  .in("clave", [
    "workflow:ver", "workflow:revisar", "workflow:asignar_cerrador",
    "expedientes:ver_equipo", "ventas:ver_equipo", "dashboard:ver_equipo", "metas:ver_equipo",
  ]);
console.log("wfPerms", wfPerms?.length, e3, wfPerms?.map((p) => p.clave));

const toInsert = [
  ...(basePerms ?? []).map((row) => row.permiso_id),
  ...(wfPerms ?? []).map((p) => p.id),
].filter(Boolean).map((permiso_id) => ({ rol_id: gerenteId, permiso_id }));

// dedupe
const seen = new Set();
const unique = toInsert.filter((r) => {
  if (seen.has(r.permiso_id)) return false;
  seen.add(r.permiso_id);
  return true;
});
console.log("toInsert", unique.length);

const { data: inserted, error: e4 } = await admin
  .from("rol_permisos")
  .insert(unique)
  .select("permiso_id");
console.log("insert result", inserted?.length, e4);

const { count, error: e5 } = await admin
  .from("rol_permisos")
  .select("permiso_id", { count: "exact", head: true })
  .eq("rol_id", gerenteId);
console.log("count after", count, e5);

// Direct SQL fallback
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const { rows: policies } = await c.query(`
  select polname, polcmd, pg_get_expr(polqual, polrelid) as using_expr,
         pg_get_expr(polwithcheck, polrelid) as check_expr
  from pg_policy
  where polrelid = 'public.rol_permisos'::regclass
`);
console.log("RLS_POLICIES", policies);
const { rows: [n] } = await c.query(`select count(*)::int as n from rol_permisos where rol_id=$1`, [gerenteId]);
console.log("PG_COUNT", n.n);

// Try SQL insert of one missing
const { rows: one } = await c.query(`
  insert into rol_permisos (rol_id, permiso_id)
  select $1::uuid, p.id from permisos p
  where p.clave = 'expedientes:crear'
  on conflict do nothing
  returning permiso_id
`, [gerenteId]);
console.log("SQL_INSERT_ONE", one);
const { rows: [n2] } = await c.query(`select count(*)::int as n from rol_permisos where rol_id=$1`, [gerenteId]);
console.log("PG_COUNT2", n2.n);
await c.end();
