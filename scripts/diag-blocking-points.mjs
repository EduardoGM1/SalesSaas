/**
 * Diagnóstico read-only: roles, overrides, vendedor→liner, huérfanos.
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
  // Detect columns on roles
  const { rows: cols } = await c.query(`
    select column_name from information_schema.columns
    where table_schema='public' and table_name='roles'
    order by ordinal_position
  `);
  console.log("ROLES_COLUMNS", cols.map((r) => r.column_name).join(","));

  const colSet = new Set(cols.map((r) => r.column_name));
  const hasTipo = colSet.has("tipo");
  const hasCreado = colSet.has("creado_en") || colSet.has("created_at");
  const creadoCol = colSet.has("creado_en") ? "creado_en" : colSet.has("created_at") ? "created_at" : null;

  const selectSql = `
    select id, nombre, slug, empresa_id
      ${hasTipo ? ", tipo" : ", null::text as tipo"}
      ${creadoCol ? `, ${creadoCol} as creado_en` : ", null::timestamptz as creado_en"}
    from public.roles
    order by empresa_id nulls first, nombre
  `;
  const { rows: roles } = await c.query(selectSql);
  const platform = roles.filter((r) => r.empresa_id == null);
  const tenant = roles.filter((r) => r.empresa_id != null);
  console.log("\n=== ROLES ALL ===");
  for (const r of roles) {
    console.log(JSON.stringify({
      id: r.id,
      nombre: r.nombre,
      slug: r.slug,
      empresa_id: r.empresa_id,
      tipo: r.tipo,
      creado_en: r.creado_en,
    }));
  }
  console.log("\nCOUNTS", { total: roles.length, platform: platform.length, tenant: tenant.length });

  // Orphan role_ids on profiles
  const { rows: orphans } = await c.query(`
    select p.id, p.email, p.role, p.role_id
    from public.profiles p
    left join public.roles r on r.id = p.role_id
    where p.role_id is not null and r.id is null
  `);
  console.log("\nORPHAN_ROLE_IDS", orphans.length, orphans.slice(0, 20));

  // Also workspace_miembros / empresa_miembros orphan role refs if columns exist
  for (const table of ["workspace_miembros", "empresa_miembros"]) {
    const { rows: tcols } = await c.query(`
      select column_name from information_schema.columns
      where table_schema='public' and table_name=$1
    `, [table]);
    const names = new Set(tcols.map((r) => r.column_name));
    if (!names.has("role_id") && !names.has("rol_id")) continue;
    const col = names.has("role_id") ? "role_id" : "rol_id";
    const { rows: o } = await c.query(`
      select count(*)::int as n
      from public.${table} m
      left join public.roles r on r.id = m.${col}
      where m.${col} is not null and r.id is null
    `);
    console.log(`ORPHAN_${table.toUpperCase()}`, o[0].n);
  }

  // Audit logs for role deletions
  const { rows: logTables } = await c.query(`
    select table_name from information_schema.tables
    where table_schema='public' and table_name in ('logs_administracion','admin_logs','audit_logs')
  `);
  console.log("\nAUDIT_TABLES", logTables.map((r) => r.table_name));

  if (logTables.some((r) => r.table_name === "logs_administracion")) {
    const { rows: logs } = await c.query(`
      select created_at, actor_id, accion, entidad_afectada, entidad_id, detalle
      from public.logs_administracion
      where accion ilike '%rol%'
         or accion ilike '%elimin%'
         or coalesce(detalle::text,'') ilike '%vendedor%'
         or coalesce(detalle::text,'') ilike '%role%'
      order by created_at desc
      limit 30
    `);
    console.log("AUDIT_ROLE_RELATED", logs.length);
    for (const l of logs.slice(0, 15)) {
      console.log(JSON.stringify({
        created_at: l.created_at,
        accion: l.accion,
        entidad_afectada: l.entidad_afectada,
        entidad_id: l.entidad_id,
        detalle: l.detalle,
      }));
    }
  }

  // 0063 / overrides adds vs denies
  const { rows: ov } = await c.query(`
    select
      count(*) filter (where otorgado = true)::int as adds,
      count(*) filter (where otorgado = false)::int as denies,
      count(*)::int as total
    from public.usuario_permisos_override
  `);
  console.log("\nOVERRIDES", ov[0]);

  // Vendedor → Liner
  const { rows: vendRoles } = await c.query(`
    select id, nombre, slug, empresa_id
    from public.roles
    where slug = 'vendedor' or lower(nombre) = 'vendedor'
    order by empresa_id nulls first
  `);
  console.log("\nVENDEDOR_ROLES", vendRoles);

  const { rows: liner } = await c.query(`
    select id, nombre, slug, empresa_id
    from public.roles
    where slug = 'liner' or lower(nombre) = 'liner'
    order by empresa_id nulls first
  `);
  console.log("LINER_ROLES", liner);

  // Users still pointing to vendedor role ids
  const { rows: usersVend } = await c.query(`
    select p.id, p.email, p.role, p.role_id, r.nombre, r.slug
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where r.slug = 'vendedor' or lower(r.nombre) = 'vendedor'
  `);
  console.log("USERS_WITH_VENDEDOR_ROLE", usersVend.length, usersVend.slice(0, 20));

  // profiles.role enum still 'vendedor'?
  const { rows: legacyRole } = await c.query(`
    select role::text, count(*)::int as n
    from public.profiles
    group by role
    order by n desc
  `);
  console.log("PROFILES_ROLE_ENUM", legacyRole);

  // Backup table from 0069?
  const { rows: bak } = await c.query(`
    select exists(
      select 1 from information_schema.tables
      where table_schema='public' and table_name='migracion_vendedor_liner_backup'
    ) as exists
  `);
  if (bak[0].exists) {
    const { rows: bakCount } = await c.query(`
      select count(*)::int as n from public.migracion_vendedor_liner_backup
    `);
    console.log("MIGRACION_BACKUP_ROWS", bakCount[0].n);
  } else {
    console.log("MIGRACION_BACKUP_ROWS", "table_missing");
  }

  // Check if additive function exists (0063 marker)
  const { rows: fn } = await c.query(`
    select proname from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and proname in (
      'resolve_user_permission_keys','admin_set_user_permission_overrides'
    )
  `);
  console.log("RBAC_FNS", fn.map((r) => r.proname));

} finally {
  await c.end();
}
