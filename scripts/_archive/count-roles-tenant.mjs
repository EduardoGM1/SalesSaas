import { readFileSync, existsSync } from "fs";
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
const admin = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { count: total } = await admin.from("roles").select("*", { count: "exact", head: true });
const { count: plat } = await admin.from("roles").select("*", { count: "exact", head: true }).is("empresa_id", null);
const { data: tenant } = await admin
  .from("roles")
  .select("id, nombre, slug, empresa_id, scope, empresas(nombre)")
  .not("empresa_id", "is", null)
  .order("slug");

const bySlug = {};
for (const r of tenant || []) bySlug[r.slug] = (bySlug[r.slug] || 0) + 1;

console.log(JSON.stringify({
  total,
  plataforma_null: plat,
  tenant_not_null: (total || 0) - (plat || 0),
  bySlug,
  slugs_present: Object.keys(bySlug).sort(),
}, null, 2));
