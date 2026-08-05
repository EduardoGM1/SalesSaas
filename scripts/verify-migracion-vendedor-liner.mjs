import { readFileSync, existsSync, appendFileSync } from "fs";
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

const PLATFORM_LINER = "a0000000-0000-4000-8000-000000000003";
const SOPORTE = "a0000000-0000-4000-8000-000000000004";

const { data: vend } = await admin.from("roles").select("id").eq("slug", "vendedor");
const { data: plat } = await admin.from("roles").select("id, nombre, slug").eq("id", PLATFORM_LINER).maybeSingle();
const { count: profilesLiner } = await admin.from("profiles").select("*", { count: "exact", head: true }).eq("role_id", PLATFORM_LINER);
const { data: flags } = await admin.from("flag_reglas").select("flags(clave), activo").eq("alcance", "rol").eq("alcance_id", PLATFORM_LINER);
const { data: soporte } = await admin.from("roles").select("id, nombre, slug").eq("id", SOPORTE).maybeSingle();
const { count: backup } = await admin.from("migracion_vendedor_liner_backup").select("*", { count: "exact", head: true });

const out = {
  vendedor_roles_left: vend?.length ?? 0,
  platform_role: plat,
  profiles_on_platform_liner: profilesLiner,
  platform_liner_flags: (flags || []).map((f) => f.flags?.clave),
  soporte,
  backup_rows: backup,
};
console.log(JSON.stringify(out, null, 2));
appendFileSync(
  resolve(root, "docs/migracion-vendedor-liner.md"),
  `\n\n## Verificación post-migración (API)\n\n\`\`\`json\n${JSON.stringify(out, null, 2)}\n\`\`\`\n`,
);
