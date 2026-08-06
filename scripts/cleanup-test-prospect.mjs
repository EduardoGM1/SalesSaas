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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}
const env = { ...loadEnv(resolve(root, ".env")), ...loadEnv(resolve(root, ".env.local")) };
const id = process.argv[2];
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("begin");
await c.query("delete from prospect_workflows where prospect_id = $1", [id]).catch(() => {});
await c.query("delete from activities where prospect_id = $1", [id]).catch(() => {});
await c.query("delete from sales where prospect_id = $1", [id]).catch(() => {});
await c.query("delete from prospects where id = $1", [id]);
await c.query("commit");
console.log("cleaned", id);
await c.end();
