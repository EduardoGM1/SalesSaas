/**
 * Continuación diagnóstico (audit cols + overrides + vendedor + empresas).
 */
import { readFileSync, existsSync } from "fs";
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
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  const { rows: logCols } = await c.query(`
    select column_name from information_schema.columns
    where table_schema='public' and table_name='logs_administracion'
    order by ordinal_position
  `);
  console.log("LOG_COLS", logCols.map((r) => r.column_name).join(","));

  // Try common timestamp column names
  const names = new Set(logCols.map((r) => r.column_name));
  const ts = names.has("creado_en") ? "creado_en" : names.has("created_at") ? "created_at" : names.has("fecha") ? "fecha" : null;
  const actor = names.has("actor_id") ? "actor_id" : names.has("usuario_id") ? "usuario_id" : null;

  if (ts) {
    const { rows: logs } = await c.query(`
      select *
      from public.logs_administracion
      where accion ilike '%rol%'
         or accion ilike '%elimin%'
         or coalesce(detalle::text,'') ilike '%vendedor%'
         or coalesce(detalle::text,'') ilike '%role%'
         or coalesce(detalle::text,'') ilike '%liner%'
      order by ${ts} desc
      limit 25
    `);
    console.log("AUDIT_ROLE_RELATED", logs.length);
    for (const l of logs) {
      console.log(JSON.stringify(l));
    }
  }

  // Recent cleanup-related logs
  if (ts) {
    const { rows: recent } = await c.query(`
      select accion, entidad_afectada, count(*)::int as n, max(${ts}) as last_at
      from public.logs_administracion
      group by 1, 2
      order by last_at desc nulls last
      limit 40
    `);
    console.log("\nAUDIT_ACTION_SUMMARY");
    for (const r of recent) console.log(JSON.stringify(r));
  }

  const { rows: ov } = await c.query(`
    select
      count(*) filter (where otorgado = true)::int as adds,
      count(*) filter (where not otorgado)::int as denies,
      count(*)::int as total
    from public.usuario_permisos_override
  `);
  console.log("\nOVERRIDES", ov[0]);

  let wsOv = null;
  const { rows: hasWs } = await c.query(`
    select exists(
      select 1 from information_schema.tables
      where table_schema='public' and table_name='workspace_usuario_permisos_override'
    ) as e
  `);
  if (hasWs[0].e) {
    const { rows } = await c.query(`
      select
        count(*) filter (where otorgado = true)::int as adds,
        count(*) filter (where not otorgado)::int as denies,
        count(*)::int as total
      from public.workspace_usuario_permisos_override
    `);
    wsOv = rows[0];
  }
  console.log("WS_OVERRIDES", wsOv);

  const { rows: vendRoles } = await c.query(`
    select id, nombre, slug, empresa_id from public.roles
    where slug = 'vendedor' or lower(nombre) = 'vendedor'
  `);
  console.log("\nVENDEDOR_ROLES", vendRoles);

  const { rows: liner } = await c.query(`
    select id, nombre, slug, empresa_id from public.roles
    where slug = 'liner' or lower(nombre) = 'liner'
  `);
  console.log("LINER_ROLES", liner);

  const { rows: usersVend } = await c.query(`
    select p.id, p.email, p.role::text, p.role_id, r.nombre, r.slug
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where r.slug = 'vendedor' or lower(r.nombre) = 'vendedor'
  `);
  console.log("USERS_WITH_VENDEDOR_ROLE_ID", usersVend.length, usersVend);

  const { rows: legacyRole } = await c.query(`
    select role::text, count(*)::int as n from public.profiles group by 1 order by 2 desc
  `);
  console.log("PROFILES_ROLE_ENUM", legacyRole);

  const { rows: roleIdDist } = await c.query(`
    select r.slug, r.nombre, r.empresa_id is null as is_platform, count(*)::int as n
    from public.profiles p
    left join public.roles r on r.id = p.role_id
    group by 1,2,3
    order by n desc
  `);
  console.log("PROFILES_BY_ROLE_ID", roleIdDist);

  const { rows: empresas } = await c.query(`select count(*)::int as n from public.empresas`);
  const { rows: workspaces } = await c.query(`select count(*)::int as n from public.workspaces`);
  console.log("EMPRESAS", empresas[0].n, "WORKSPACES", workspaces[0].n);

  const { rows: bak } = await c.query(`
    select exists(
      select 1 from information_schema.tables
      where table_schema='public' and table_name='migracion_vendedor_liner_backup'
    ) as exists
  `);
  if (bak[0].exists) {
    const { rows: bakCount } = await c.query(`
      select tipo_registro, count(*)::int as n
      from public.migracion_vendedor_liner_backup
      group by 1 order by 1
    `).catch(async () => {
      const { rows: n } = await c.query(`select count(*)::int as n from public.migracion_vendedor_liner_backup`);
      return { rows: [{ tipo_registro: "all", n: n[0].n }] };
    });
    console.log("MIGRACION_BACKUP", bakCount);
  } else {
    console.log("MIGRACION_BACKUP", "missing");
  }

  // Check resolve_user_permission_keys for EXCEPT (additive?)
  const { rows: def } = await c.query(`
    select pg_get_functiondef('public.resolve_user_permission_keys(uuid)'::regprocedure) as def
  `);
  const d = def[0]?.def || "";
  console.log("RESOLVE_HAS_EXCEPT", /except/i.test(d));
  console.log("RESOLVE_HAS_OTORGADO_FALSE", /otorgado\s*=\s*false/i.test(d));

} finally {
  await c.end();
}
