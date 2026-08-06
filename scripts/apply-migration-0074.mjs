import { readFileSync, existsSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");
const MIGRATION_PATH = resolve(root, "supabase/migrations/0074_admin_peer_isolation_gestionar_permisos.sql");

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
const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(readFileSync(MIGRATION_PATH, "utf8"));
  const { rows } = await client.query(
    `select p.clave, r.slug
     from rol_permisos rp
     join roles r on r.id = rp.rol_id
     join permisos p on p.id = rp.permiso_id
     where r.empresa_id is null
       and p.clave = 'usuarios.gestionar_permisos'
     order by r.slug`,
  );
  console.log("✓ 0074 aplicada. usuarios.gestionar_permisos en roles:", rows.map((r) => r.slug).join(", ") || "(ninguno)");
} finally {
  await client.end();
}
