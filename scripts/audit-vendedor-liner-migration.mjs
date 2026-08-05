/**
 * Auditoría previa: usuarios con rol Vendedor + comparación de permisos/flags vs Liner.
 * No modifica datos. Uso: node scripts/audit-vendedor-liner-migration.mjs
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
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

const { data: vendedorRoles, error: rErr } = await admin
  .from("roles")
  .select("id, nombre, slug, empresa_id, paquete_id, es_sistema, empresas(nombre)")
  .eq("slug", "vendedor");
if (rErr) throw rErr;

const { data: linerRoles } = await admin
  .from("roles")
  .select("id, nombre, slug, empresa_id, paquete_id, empresas(nombre)")
  .eq("slug", "liner");

const { data: soporteRoles } = await admin
  .from("roles")
  .select("id, nombre, slug, empresa_id")
  .eq("slug", "soporte");

const vendedorIds = (vendedorRoles || []).map((r) => r.id);
const linerByEmpresa = new Map((linerRoles || []).map((r) => [r.empresa_id || "__platform__", r]));

async function permKeys(roleId) {
  const { data } = await admin
    .from("rol_permisos")
    .select("permisos(clave)")
    .eq("rol_id", roleId);
  return new Set((data || []).map((x) => x.permisos?.clave).filter(Boolean));
}

async function packageFlagKeys(paqueteId) {
  if (!paqueteId) return new Set();
  const { data } = await admin
    .from("paquete_flags")
    .select("flags(clave), activo")
    .eq("paquete_id", paqueteId)
    .eq("activo", true);
  return new Set((data || []).map((x) => x.flags?.clave).filter(Boolean));
}

const roleComparisons = [];
for (const v of vendedorRoles || []) {
  const liner = linerByEmpresa.get(v.empresa_id || "__platform__") || null;
  const vPerms = await permKeys(v.id);
  const lPerms = liner ? await permKeys(liner.id) : new Set();
  const vFlags = await packageFlagKeys(v.paquete_id);
  const lFlags = liner ? await packageFlagKeys(liner.paquete_id) : new Set();
  const missingPerms = [...vPerms].filter((k) => !lPerms.has(k)).sort();
  const missingFlags = [...vFlags].filter((k) => !lFlags.has(k)).sort();
  const extraLinerFlags = [...lFlags].filter((k) => !vFlags.has(k)).sort();
  roleComparisons.push({
    vendedor_role_id: v.id,
    empresa_id: v.empresa_id,
    empresa_nombre: v.empresas?.nombre || (v.empresa_id ? null : "PLATAFORMA"),
    liner_role_id: liner?.id || null,
    vendedor_perm_count: vPerms.size,
    liner_perm_count: lPerms.size,
    missing_perms_in_liner: missingPerms,
    vendedor_flag_count: vFlags.size,
    liner_flag_count: lFlags.size,
    missing_flags_in_liner: missingFlags,
    liner_only_flags: extraLinerFlags,
    liner_more_restrictive: missingPerms.length > 0 || missingFlags.length > 0,
  });
}

const { data: profilesVend } = await admin
  .from("profiles")
  .select("id, full_name, email, role, role_id, workspace_activo_id")
  .in("role_id", vendedorIds.length ? vendedorIds : ["00000000-0000-0000-0000-000000000000"]);

const { data: membersVend } = await admin
  .from("workspace_miembros")
  .select("usuario_id, workspace_id, role_id, rol_en_workspace, workspaces(id, nombre, tipo, empresa_id, empresas(nombre)), profiles(id, full_name, email), roles(id, slug, nombre, empresa_id)")
  .in("role_id", vendedorIds.length ? vendedorIds : ["00000000-0000-0000-0000-000000000000"]);

const { data: empresaVend } = await admin
  .from("empresa_miembros")
  .select("usuario_id, empresa_id, role_id, es_admin, empresas(nombre), profiles(id, full_name, email), roles(slug, nombre)")
  .in("role_id", vendedorIds.length ? vendedorIds : ["00000000-0000-0000-0000-000000000000"]);

const { data: flagReglasVend } = await admin
  .from("flag_reglas")
  .select("id, flag_id, alcance, alcance_id, activo, flags(clave)")
  .eq("alcance", "rol")
  .in("alcance_id", vendedorIds.length ? vendedorIds : ["00000000-0000-0000-0000-000000000000"]);

const { count: soporteProfileCount } = await admin
  .from("profiles")
  .select("*", { count: "exact", head: true })
  .in("role_id", (soporteRoles || []).map((r) => r.id).length
    ? (soporteRoles || []).map((r) => r.id)
    : ["00000000-0000-0000-0000-000000000000"]);

const { data: legacyRolVendedor } = await admin
  .from("workspace_miembros")
  .select("usuario_id, workspace_id, role_id, rol_en_workspace, roles(slug), profiles(full_name, email), workspaces(nombre, empresa_id, empresas(nombre))")
  .eq("rol_en_workspace", "vendedor");

const report = {
  generated_at: new Date().toISOString(),
  vendedor_roles: vendedorRoles,
  liner_roles: linerRoles,
  soporte_roles: soporteRoles,
  soporte_profiles_count: soporteProfileCount,
  role_comparisons: roleComparisons,
  any_liner_more_restrictive: roleComparisons.some((c) => c.liner_more_restrictive),
  profiles_with_vendedor_role_id: profilesVend || [],
  workspace_miembros_with_vendedor_role_id: membersVend || [],
  empresa_miembros_with_vendedor_role_id: empresaVend || [],
  flag_reglas_on_vendedor_roles: flagReglasVend || [],
  workspace_miembros_legacy_rol_en_workspace_vendedor: (legacyRolVendedor || []).length,
  legacy_sample: (legacyRolVendedor || []).slice(0, 20),
};

const outPath = resolve(root, "docs/_audit-vendedor-liner-raw.json");
writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({
  outPath,
  vendedor_roles: (vendedorRoles || []).length,
  profiles: (profilesVend || []).length,
  workspace_miembros: (membersVend || []).length,
  empresa_miembros: (empresaVend || []).length,
  flag_reglas: (flagReglasVend || []).length,
  any_liner_more_restrictive: report.any_liner_more_restrictive,
  comparisons: roleComparisons.map((c) => ({
    empresa: c.empresa_nombre,
    missing_perms: c.missing_perms_in_liner.length,
    missing_flags: c.missing_flags_in_liner.length,
    missing_flag_sample: c.missing_flags_in_liner.slice(0, 15),
    liner_id: c.liner_role_id,
  })),
  soporte_untouched_check: { roles: (soporteRoles || []).length, profiles: soporteProfileCount },
}, null, 2));
