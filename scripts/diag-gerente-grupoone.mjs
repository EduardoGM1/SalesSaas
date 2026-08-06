/**
 * Diagnóstico Gerente grupoone / expedientes.
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

const email = "cuentapremium4minecrafted@gmail.com";

try {
  const { rows: [u] } = await c.query(
    `select id, email, full_name, role::text, role_id, workspace_activo_id, is_super_admin, user_permissions, admin_permissions
     from profiles where email = $1`,
    [email],
  );
  console.log("USER", JSON.stringify(u, null, 2));

  const { rows: ws } = await c.query(
    `select id, nombre, tipo, empresa_id, estado from workspaces
     where lower(nombre) like '%grupo%' or lower(nombre) like '%group%'
     order by nombre`,
  );
  console.log("\nWS_MATCH", ws);

  const { rows: members } = await c.query(
    `
    select wm.workspace_id, wm.rol_en_workspace, wm.role_id,
           w.nombre, w.tipo, w.empresa_id, w.estado,
           r.nombre as rol_nombre, r.slug as rol_slug, r.empresa_id as rol_empresa_id
    from workspace_miembros wm
    join workspaces w on w.id = wm.workspace_id
    left join roles r on r.id = wm.role_id
    where wm.usuario_id = $1
    order by w.nombre
    `,
    [u.id],
  );
  console.log("\nMEMBERSHIPS", JSON.stringify(members, null, 2));

  // active workspace
  if (u.workspace_activo_id) {
    const { rows: [aw] } = await c.query(
      `select id, nombre, tipo, empresa_id from workspaces where id = $1`,
      [u.workspace_activo_id],
    );
    console.log("\nACTIVE_WS", aw);
  }

  // role permissions for membership role_id(s)
  for (const m of members) {
    if (!m.role_id) {
      console.log("\nNO_ROLE_ID for", m.nombre, "rol_en_workspace=", m.rol_en_workspace);
      continue;
    }
    const { rows: perms } = await c.query(
      `
      select p.clave, p.nombre_visible, p.modulo, p.capa
      from rol_permisos rp
      join permisos p on p.id = rp.permiso_id
      where rp.rol_id = $1
      order by p.clave
      `,
      [m.role_id],
    );
    console.log(`\nROLE_PERMS ${m.rol_slug || m.role_id} (${perms.length})`);
    console.log(perms.map((p) => p.clave).join(", "));
    const exp = perms.filter((p) => p.clave.includes("expediente") || p.clave.includes("prospect") || p.clave.startsWith("sales"));
    console.log("EXPEDIENTE_RELATED", exp.map((p) => p.clave));
  }

  // overrides
  const { rows: ov } = await c.query(
    `
    select p.clave, o.otorgado
    from usuario_permisos_override o
    join permisos p on p.id = o.permiso_id
    where o.usuario_id = $1
    order by p.clave
    `,
    [u.id],
  );
  console.log("\nOVERRIDES", ov);

  // resolve_user_permission_keys if exists
  try {
    const { rows: [resolved] } = await c.query(
      `select public.resolve_user_permission_keys($1::uuid) as keys`,
      [u.id],
    );
    const keys = resolved?.keys || [];
    console.log("\nRESOLVED_KEYS_COUNT", keys.length);
    console.log("RESOLVED_EXP", keys.filter((k) => String(k).includes("expediente") || String(k).includes("prospect") || String(k).startsWith("sales") || String(k).includes("crear")));
    console.log("RESOLVED_SAMPLE", keys.slice(0, 40));
  } catch (e) {
    console.log("RESOLVE_ERR", e.message);
  }

  // effective_workspace_permissions for grupoone
  const target = members.find((m) => /grupo|group/i.test(m.nombre)) || members[0];
  if (target) {
    try {
      const { rows: [eff] } = await c.query(
        `select public.effective_workspace_permissions($1::uuid, $2::uuid) as keys`,
        [u.id, target.workspace_id],
      );
      const keys = eff?.keys || [];
      console.log("\nEFF_WS_KEYS_COUNT", keys.length);
      console.log("EFF_WS_EXP", keys.filter((k) => /expediente|prospect|sales|crear/i.test(String(k))));
      console.log("EFF_WS_ALL", keys);
    } catch (e) {
      console.log("EFF_WS_ERR", e.message);
    }

    // empresa flags / packages
    if (target.empresa_id) {
      const { rows: emp } = await c.query(`select id, nombre from empresas where id = $1`, [target.empresa_id]);
      console.log("\nEMPRESA", emp[0]);
      try {
        const { rows: flags } = await c.query(
          `
          select f.clave, fr.habilitado
          from flag_reglas fr
          join flags f on f.id = fr.flag_id
          where fr.empresa_id = $1 or fr.workspace_id = $2
          order by f.clave
          `,
        ).catch(() => ({ rows: [] }));
        // retry with correct schema
      } catch { /* */ }

      const { rows: flagCols } = await c.query(`
        select column_name from information_schema.columns
        where table_schema='public' and table_name='flag_reglas'
      `);
      console.log("FLAG_REGLAS_COLS", flagCols.map((r) => r.column_name));
    }
  }

  // catalog expediente keys
  const { rows: cat } = await c.query(
    `select clave from permisos where clave ilike '%expediente%' or clave ilike '%prospect%' order by 1`,
  );
  console.log("\nCATALOG_EXP", cat.map((r) => r.clave));

  // gerente roles in system
  const { rows: gerRoles } = await c.query(
    `select id, nombre, slug, empresa_id from roles where slug ilike '%gerente%' or nombre ilike '%gerente%'`,
  );
  console.log("\nGERENTE_ROLES", gerRoles);

} finally {
  await c.end();
}
