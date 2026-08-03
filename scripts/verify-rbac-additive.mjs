/**
 * Verificación RBAC aditivo — conteos y detalle de denies.
 * Requiere DATABASE_URL en .env.local
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const path = resolve(__dir, "../.env.local");
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i === -1) continue;
    const key = trimmed.slice(0, i).trim();
    let val = trimmed.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"'))
      || (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  loadEnvLocal();
  if (!process.env.DATABASE_URL) {
    console.error("Falta DATABASE_URL");
    process.exit(2);
  }
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const globalCount = await client.query(`
      SELECT count(*) FILTER (WHERE otorgado) AS adds,
             count(*) FILTER (WHERE NOT otorgado) AS denies
      FROM public.usuario_permisos_override
    `);
    const salaCount = await client.query(`
      SELECT count(*) FILTER (WHERE otorgado) AS adds,
             count(*) FILTER (WHERE NOT otorgado) AS denies
      FROM public.workspace_usuario_permisos_override
    `);
    const denyDetail = await client.query(`
      SELECT o.usuario_id,
             p.email,
             p.full_name,
             o.permiso_id,
             perm.clave AS permiso,
             o.otorgado
      FROM public.usuario_permisos_override o
      JOIN public.permisos perm ON perm.id = o.permiso_id
      LEFT JOIN public.profiles p ON p.id = o.usuario_id
      WHERE o.otorgado = false
    `);
    const fnCheck = await client.query(`
      SELECT pg_get_functiondef(p.oid) AS def
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('resolve_user_permission_keys', 'effective_workspace_permissions')
    `);

    let auditRows = [];
    try {
      const logs = await client.query(`
        SELECT created_at, accion, entidad_afectada, entidad_id, detalle
        FROM public.admin_logs
        WHERE accion ILIKE '%permis%'
           OR detalle::text ILIKE '%override%'
           OR detalle::text ILIKE '%otorgado%'
        ORDER BY created_at DESC
        LIMIT 20
      `);
      auditRows = logs.rows;
    } catch (err) {
      auditRows = [{ error: err.message }];
    }

    const now = new Date().toISOString();
    console.log(JSON.stringify({
      verified_at: now,
      usuario_permisos_override: globalCount.rows[0],
      workspace_usuario_permisos_override: salaCount.rows[0],
      deny_rows: denyDetail.rows,
      functions_have_except: fnCheck.rows.map((r) => ({
        has_except: /\bexcept\b/i.test(r.def || ""),
        deny_branch: (r.def || "").includes("otorgado = false"),
      })),
      related_admin_logs: auditRows,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
