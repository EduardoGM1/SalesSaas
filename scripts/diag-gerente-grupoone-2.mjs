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
const empresaId = "599516eb-9d54-4623-96b9-726e481f28d1";
const linerId = "a0000000-0000-4000-8000-000000000003";
const userId = "d3148015-a42f-418a-aa4c-29dba6f5e261";
const wsId = "7331b720-1cc0-4c75-924e-1f74497c7919";

const { rows: roles } = await c.query(
  `select id, slug, paquete_id from roles where empresa_id = $1 order by slug`,
  [empresaId],
);
console.log("TENANT_ROLES", roles);
for (const r of roles) {
  const { rows: [n] } = await c.query(
    `select count(*)::int as n from rol_permisos where rol_id = $1`,
    [r.id],
  );
  console.log(r.slug, "perms", n.n, "paquete", r.paquete_id);
}
const { rows: [liner] } = await c.query(
  `select count(*)::int as n from rol_permisos where rol_id = $1`,
  [linerId],
);
console.log("PLATFORM_LINER_PERMS", liner.n);

const { rows: pkgs } = await c.query(
  `select id, slug, nombre from paquetes_acceso where empresa_id = $1`,
  [empresaId],
);
console.log("PACKAGES", pkgs);

for (const clave of ["expedientes:ver_propios", "expedientes:crear", "expedientes:ver_equipo"]) {
  const { rows: [r] } = await c.query(
    `select public.workspace_has_permission($1::uuid, $2::uuid, $3::text) as ok`,
    [userId, wsId, clave],
  );
  console.log("HAS", clave, r.ok);
}

await c.end();
