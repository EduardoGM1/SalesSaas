/**
 * Diagnóstico: workspaces del superadmin y membresías.
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
  const email = "eduardolalito99@hotmail.com";
  const { rows: [u] } = await c.query(
    `select id, email, workspace_activo_id from profiles where email = $1`,
    [email],
  );
  console.log("USER", u);

  const { rows: memberships } = await c.query(
    `
    select wm.workspace_id, wm.rol_en_workspace, w.nombre, w.tipo, w.empresa_id, e.nombre as empresa
    from workspace_miembros wm
    join workspaces w on w.id = wm.workspace_id
    left join empresas e on e.id = w.empresa_id
    where wm.usuario_id = $1
    order by w.tipo, w.nombre
    `,
    [u.id],
  );
  console.log("MEMBERSHIPS", memberships.length);
  for (const m of memberships) console.log(JSON.stringify(m));

  const { rows: allWs } = await c.query(
    `select id, nombre, tipo, empresa_id from workspaces order by tipo, nombre`,
  );
  console.log("ALL_WORKSPACES", allWs.length);
  for (const w of allWs) console.log(JSON.stringify(w));

  const { rows: active } = await c.query(
    `select id, nombre, tipo, empresa_id from workspaces where id = $1`,
    [u.workspace_activo_id],
  );
  console.log("ACTIVE", active[0] || null);
} finally {
  await c.end();
}
