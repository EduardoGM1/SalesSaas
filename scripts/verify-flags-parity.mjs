/**
 * Verifica paridad de acceso pre/post motor de flags (migración 0051).
 *
 * Uso:
 *   npm run verify:flags
 *
 * Requiere en .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL (o VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Compara:
 *   - herramientas:* (rol + override) vs resolver_flag(módulo)
 *   - membresía PRO vigente vs worksheet.money_box
 *
 * Checklist manual (salida al final):
 *   - Off global survey → ningún tab visible
 *   - Regla usuario en un tab → solo ese usuario lo ve
 *   - Usuario PRO migrado → useFlag('worksheet.money_box') === true
 *   - Gates de producto usan flags (no if plan===pro / herramientas:survey)
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dir = dirname(fileURLToPath(import.meta.url));

const TOOL_MAP = [
  { perm: "herramientas:survey", flag: "survey" },
  { perm: "herramientas:vacaciones", flag: "proyeccion_vacaciones" },
  { perm: "herramientas:worksheet", flag: "worksheet" },
  { perm: "herramientas:analysis", flag: "analysis" },
];

function loadEnvLocal() {
  const path = resolve(__dir, "../.env.local");
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const i = trimmed.indexOf("=");
      if (i === -1) continue;
      const key = trimmed.slice(0, i).trim();
      let val = trimmed.slice(i + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* opcional */
  }
}

/** Misma semántica que session-service + resolveUserPermissions (fallback Vendedor). */
const VENDEDOR_TOOL_DEFAULTS = new Set([
  "herramientas:survey",
  "herramientas:survey_configurar_preguntas",
  "herramientas:vacaciones",
  "herramientas:worksheet",
  "herramientas:analysis",
]);

async function legacyToolAccess(sb, userId, roleId, isSuperAdmin, permClave) {
  if (isSuperAdmin) return true;

  let roleHas = false;
  if (roleId) {
    const { data } = await sb
      .from("rol_permisos")
      .select("permiso_id, permisos!inner(clave)")
      .eq("rol_id", roleId)
      .eq("permisos.clave", permClave)
      .maybeSingle();
    roleHas = Boolean(data);
  } else {
    // Sin role_id: la sesión cae a VENDEDOR_DEFAULT_PERMISSIONS (incluye herramientas).
    roleHas = VENDEDOR_TOOL_DEFAULTS.has(permClave);
  }

  const { data: ov } = await sb
    .from("usuario_permisos_override")
    .select("otorgado, permisos!inner(clave)")
    .eq("usuario_id", userId)
    .eq("permisos.clave", permClave)
    .maybeSingle();

  if (ov && typeof ov.otorgado === "boolean") return ov.otorgado === true;
  return roleHas;
}

async function legacyMoneyBox(sb, userId) {
  const { data } = await sb
    .from("membresias")
    .select("estado, planes!inner(nombre)")
    .eq("usuario_id", userId)
    .in("estado", ["activa", "en_prueba"])
    .order("fecha_inicio", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return false;
  return String(data.planes?.nombre || "").toLowerCase() === "pro";
}

async function main() {
  loadEnvLocal();
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Faltan SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { error: flagsErr } = await sb.from("flags").select("id").limit(1);
  if (flagsErr) {
    console.error("✗ Tabla flags no disponible. Aplica migración 0051 primero.");
    console.error("  Archivo: supabase/migrations/0051_feature_flags.sql");
    console.error("  O: npm run db:migrate:0051 (requiere DATABASE_URL)");
    console.error(flagsErr.message);
    process.exit(2);
  }

  const { data: catalog, error: catErr } = await sb.from("flags").select("clave").order("clave");
  if (catErr) throw catErr;
  const claves = (catalog || []).map((f) => f.clave);
  console.log(`Catálogo flags (${claves.length}): ${claves.join(", ")}`);

  const required = [
    "survey",
    "proyeccion_vacaciones",
    "worksheet",
    "analysis",
    "worksheet.money_box",
    "survey.tab.motivaciones",
    "survey.tab.timeshare_information",
    "survey.tab.gastos_viaje",
    "survey.tab.resumen",
  ];
  const missing = required.filter((c) => !claves.includes(c));
  if (missing.length) {
    console.error("✗ Faltan flags seed:", missing.join(", "));
    process.exit(3);
  }
  console.log("✓ Seed de claves requerido OK");

  const { data: profiles, error: pErr } = await sb
    .from("profiles")
    .select("id, email, full_name, role_id, is_super_admin, role")
    .order("created_at", { ascending: true });
  if (pErr) throw pErr;

  const users = profiles || [];
  console.log(`Comparando ${users.length} usuarios…\n`);

  let mismatches = 0;
  let checked = 0;

  for (const u of users) {
    const label = u.email || u.full_name || u.id.slice(0, 8);

    for (const { perm, flag } of TOOL_MAP) {
      const legacy = await legacyToolAccess(sb, u.id, u.role_id, u.is_super_admin === true, perm);
      const { data: resolved, error: rErr } = await sb.rpc("resolver_flag", {
        p_clave: flag,
        p_usuario_id: u.id,
      });
      if (rErr) throw rErr;
      checked += 1;
      if (Boolean(resolved) !== Boolean(legacy)) {
        mismatches += 1;
        console.log(`MISMATCH ${label} | ${flag}: legacy=${legacy} flag=${resolved}`);
      }
    }

    const legacyMb = await legacyMoneyBox(sb, u.id);
    const { data: mbFlag, error: mbErr } = await sb.rpc("resolver_flag", {
      p_clave: "worksheet.money_box",
      p_usuario_id: u.id,
    });
    if (mbErr) throw mbErr;
    const { data: wsFlag, error: wsErr } = await sb.rpc("resolver_flag", {
      p_clave: "worksheet",
      p_usuario_id: u.id,
    });
    if (wsErr) throw wsErr;
    checked += 1;
    // Money Box: regla PRO + jerarquía (padre worksheet). Superadmin → todo true.
    const expectedMb = u.is_super_admin === true ? true : (Boolean(legacyMb) && Boolean(wsFlag));
    if (Boolean(mbFlag) !== Boolean(expectedMb)) {
      mismatches += 1;
      console.log(
        `MISMATCH ${label} | worksheet.money_box: expected=${expectedMb} (legacyPRO=${legacyMb}, worksheet=${wsFlag}) flag=${mbFlag}`,
      );
    }
  }

  console.log(`\nChecks: ${checked}`);
  if (mismatches === 0) {
    console.log("✓ Paridad OK — legacy vs resolver_flag sin diferencias.");
  } else {
    console.log(`✗ ${mismatches} diferencias encontradas.`);
  }

  console.log(`
── Checklist manual (UI) ─────────────────────────────────────
[ ] Off global survey → ningún tab Survey visible
[ ] Regla usuario en un tab → solo ese usuario ve el tab
[ ] Usuario PRO migrado → useFlag('worksheet.money_box') === true
[ ] Admin → Módulos: árbol + default + excepciones rol/usuario
[ ] Cambiar membresía PRO/básico sync regla worksheet.money_box
[ ] Sin if (plan === 'pro') / herramientas:survey en gates de producto
──────────────────────────────────────────────────────────────
`);

  process.exit(mismatches === 0 ? 0 : 4);
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
