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

const { data } = await admin
  .from("workspace_miembros")
  .select("usuario_id, rol_en_workspace, role_id, roles(slug, nombre, empresa_id), workspaces(nombre, empresa_id, empresas(nombre)), profiles(email, full_name)")
  .eq("rol_en_workspace", "vendedor");

const bySlug = {};
for (const m of data || []) {
  const s = m.roles?.slug || "(null role_id)";
  bySlug[s] = (bySlug[s] || 0) + 1;
}
console.log("legacy rol_en_workspace=vendedor by roles.slug:", bySlug);

const audit = JSON.parse(readFileSync(resolve(root, "docs/_audit-vendedor-liner-raw.json"), "utf8"));
const ids = audit.profiles_with_vendedor_role_id.map((p) => p.id);
const { data: mems } = await admin
  .from("workspace_miembros")
  .select("usuario_id, role_id, rol_en_workspace, roles(slug), workspaces(nombre, tipo, empresa_id, empresas(nombre)), profiles(email)")
  .in("usuario_id", ids);

const by = {};
for (const m of mems || []) {
  const k = `${m.workspaces?.tipo || "?"} | slug=${m.roles?.slug || "null"} | legacy=${m.rol_en_workspace}`;
  by[k] = (by[k] || 0) + 1;
}
console.log("memberships of platform-vendedor profiles:", by);

// Enrich backup rows: empresa/sala from memberships
const enriched = [];
for (const p of audit.profiles_with_vendedor_role_id) {
  const mine = (mems || []).filter((m) => m.usuario_id === p.id);
  enriched.push({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    profiles_role: p.role,
    profiles_role_id: p.role_id,
    memberships: mine.map((m) => ({
      sala: m.workspaces?.nombre,
      tipo: m.workspaces?.tipo,
      empresa: m.workspaces?.empresas?.nombre || null,
      empresa_id: m.workspaces?.empresa_id,
      role_slug: m.roles?.slug,
      rol_en_workspace: m.rol_en_workspace,
      role_id: m.role_id,
    })),
  });
}
console.log(JSON.stringify({ enriched_count: enriched.length, sample: enriched.slice(0, 3) }, null, 2));

const { data: enumRows } = await admin.rpc("execute_sql_readonly", {}).maybeSingle?.();
// fallback: try information_schema via raw - use a simple query
const { data: roleDist } = await admin.from("profiles").select("role").limit(1000);
const dist = {};
for (const r of roleDist || []) dist[r.role] = (dist[r.role] || 0) + 1;
console.log("profiles.role distribution sample:", dist);

const fs = await import("fs");
fs.writeFileSync(resolve(root, "docs/_audit-vendedor-profiles-enriched.json"), JSON.stringify(enriched, null, 2));
console.log("wrote enriched profiles");
