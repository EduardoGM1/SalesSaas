/**
 * Ejecuta 0069_migracion_vendedor_a_liner.sql contra DATABASE_URL.
 * Uso: node scripts/run-migracion-vendedor-liner.mjs
 */
import { readFileSync, existsSync, appendFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

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
if (!env.DATABASE_URL) {
  console.error("DATABASE_URL requerido");
  process.exit(1);
}

const sqlPath = resolve(root, "supabase/migrations/0069_migracion_vendedor_a_liner.sql");
const sql = readFileSync(sqlPath, "utf8");

const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

console.log("Pre-check: roles slug=vendedor…");
const pre = await client.query(`select id, nombre, slug, empresa_id from public.roles where slug = 'vendedor'`);
console.log(pre.rows);

const soportePre = await client.query(
  `select id, nombre, slug from public.roles where slug = 'soporte'`,
);
const soporteUsersPre = await client.query(
  `select count(*)::int as n from public.profiles p
   join public.roles r on r.id = p.role_id where r.slug = 'soporte'`,
);

try {
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");
  console.log("Migración SQL aplicada OK");
} catch (err) {
  await client.query("rollback");
  console.error("ROLLBACK:", err.message);
  await client.end();
  process.exit(1);
}

const postVend = await client.query(`select count(*)::int as n from public.roles where slug = 'vendedor'`);
const postLinerPlat = await client.query(
  `select id, nombre, slug from public.roles where id = 'a0000000-0000-4000-8000-000000000003'`,
);
const postProfiles = await client.query(
  `select count(*)::int as n from public.profiles p
   join public.roles r on r.id = p.role_id where r.slug = 'vendedor'`,
);
const backupCount = await client.query(
  `select fuente, count(*)::int as n from public.migracion_vendedor_liner_backup group by fuente`,
);
const soportePost = await client.query(`select id, nombre, slug from public.roles where slug = 'soporte'`);
const soporteUsersPost = await client.query(
  `select count(*)::int as n from public.profiles p
   join public.roles r on r.id = p.role_id where r.slug = 'soporte'`,
);
const flagCount = await client.query(
  `select count(*)::int as n from public.flag_reglas
   where alcance = 'rol' and alcance_id = 'a0000000-0000-4000-8000-000000000003'`,
);
const logs = await client.query(
  `select count(*)::int as n from public.logs_administracion
   where detalle->>'cambiado_por' = 'sistema-migracion-vendedor-liner'`,
);

const summary = {
  roles_vendedor_restantes: postVend.rows[0].n,
  profiles_con_vendedor: postProfiles.rows[0].n,
  platform_role: postLinerPlat.rows[0],
  backup: backupCount.rows,
  flag_reglas_on_platform_liner: flagCount.rows[0].n,
  audit_logs: logs.rows[0].n,
  soporte_pre: { roles: soportePre.rows, users: soporteUsersPre.rows[0].n },
  soporte_post: { roles: soportePost.rows, users: soporteUsersPost.rows[0].n },
  soporte_sin_cambios:
    JSON.stringify(soportePre.rows) === JSON.stringify(soportePost.rows)
    && soporteUsersPre.rows[0].n === soporteUsersPost.rows[0].n,
};

console.log(JSON.stringify(summary, null, 2));

const docPath = resolve(root, "docs/migracion-vendedor-liner.md");
appendFileSync(
  docPath,
  `\n\n## Resultado de ejecución\n\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`\n`,
  "utf8",
);

await client.end();

// Doble check vía service role
const admin = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: leftover } = await admin.from("roles").select("id").eq("slug", "vendedor");
console.log("API leftover vendedor roles:", leftover?.length ?? 0);
