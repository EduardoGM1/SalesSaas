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

const def = await c.query(
  `select pg_get_functiondef(oid) as d from pg_proc where proname = 'admin_set_user_permissions'`,
);
console.log("--- RPC ---\n", def.rows[0]?.d);

const admins = await c.query(
  `select email, admin_permissions, role::text
   from public.profiles
   where role = 'admin' and coalesce(is_super_admin, false) = false`,
);
console.log("--- admins ---\n", JSON.stringify(admins.rows, null, 2));

// Reproduce sanitize+RPC filter mismatch
const sent = ["ver_resumen", "gestionar_usuarios", "gestionar_metas", "ver_metricas", "gestionar_soporte"];
const allowedLegacy = [
  "dashboard:read", "users:read", "users:deactivate", "users:activate", "users:export",
  "goals:read", "tools:analytics",
];
console.log("--- mismatch ---");
console.log("sent", sent);
console.log("would survive RPC filter", sent.filter((k) => allowedLegacy.includes(k)));

await c.end();
