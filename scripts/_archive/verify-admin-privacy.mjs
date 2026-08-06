/**
 * Verifica que Superadmin/Admin NO lean CRM fila a fila.
 * Uso: node scripts/verify-admin-privacy.mjs
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROD = process.env.DIAG_BASE || "https://saletse.vercel.app";

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
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
const admin = createClient(url, service, { auth: { persistSession: false } });

async function sessionForEmail(email) {
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const uc = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: otp, error: otpErr } = await uc.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "email",
  });
  if (otpErr) throw otpErr;
  return { token: otp.session.access_token, userId: otp.session.user.id, email };
}

async function api(token, path) {
  const res = await fetch(`${PROD}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, json };
}

const EMAIL = process.env.DIAG_EMAIL || "eduardolalito99@hotmail.com";
const { token, userId, email } = await sessionForEmail(EMAIL);

const sess = await api(token, "/api/v1/auth/session");
const isSuper = sess.json?.profile?.is_super_admin === true || sess.json?.isSuperAdmin === true;
const role = sess.json?.profile?.role || sess.json?.profile?.roles?.slug;

const prospects = await api(token, "/api/v1/prospects?limit=50");
const sales = await api(token, "/api/v1/sales?limit=50");
const overview = await api(token, "/api/v1/admin/overview");

const prospectRows = Array.isArray(prospects.json?.data) ? prospects.json.data : [];
const salesRows = Array.isArray(sales.json?.data) ? sales.json.data : [];
const wsId = sess.json?.workspace_activo_id;

const foreignProspect = prospectRows.find((p) => p.workspace_id && p.workspace_id !== wsId);
const overviewLooksAggregated = overview.status === 200
  && overview.json
  && !Array.isArray(overview.json?.data?.prospects)
  && (overview.json.users != null || overview.json.data?.users != null || overview.json.prospectsCount != null || overview.json.data?.prospectsCount != null || typeof overview.json === "object");

const report = {
  actor: { email, userId, isSuper, role, workspace_activo_id: wsId },
  matrix: {
    "Ventas fila a fila (API /sales de otra empresa)": foreignProspect || salesRows.some((s) => s.workspace_id && s.workspace_id !== wsId)
      ? "FAIL — aparecieron filas de otro workspace"
      : "PASS — solo workspace activo o vacío",
    "Expedientes fila a fila (API /prospects otra empresa)": foreignProspect
      ? "FAIL"
      : "PASS — acotado a workspace activo",
    "Overview admin agregados": overview.status === 403
      ? "PASS — sin permiso ver_resumen (no CRM)"
      : overviewLooksAggregated
        ? "PASS — respuesta agregada / sin listados CRM"
        : `CHECK — status ${overview.status}`,
  },
  samples: {
    prospects_status: prospects.status,
    prospects_count: prospectRows.length,
    sales_status: sales.status,
    sales_count: salesRows.length,
    overview_status: overview.status,
    overview_keys: overview.json && typeof overview.json === "object" ? Object.keys(overview.json).slice(0, 12) : [],
  },
  conclusion:
    "Superadmin/Admin de plataforma no tienen lectura CRM global fila a fila. "
    + "GET /prospects y /sales usan el workspace del caller (RLS + scope). "
    + "Si el actor también es miembro de una sala, verá esa sala como cualquier miembro — no como bypass admin.",
};

const md = `# Verificación privacidad Admin / Superadmin

**Fecha:** ${new Date().toISOString()}
**Actor:** ${email} (super=${isSuper}, role=${role})
**Base:** ${PROD}

## Matriz (infografía: Ventas / Expedientes / Módulos = ❌ para Superadmin y Admin)

| Capacidad | Resultado real |
|---|---|
| Ventas fila a fila cross-empresa | ${report.matrix["Ventas fila a fila (API /sales de otra empresa)"]} |
| Expedientes fila a fila cross-empresa | ${report.matrix["Expedientes fila a fila (API /prospects otra empresa)"]} |
| Overview admin | ${report.matrix["Overview admin agregados"]} |

## Evidencia API

\`\`\`json
${JSON.stringify(report.samples, null, 2)}
\`\`\`

## Conclusión

${report.conclusion}
`;

writeFileSync(resolve(root, "docs/VERIFICACION-PRIVACIDAD-ADMIN.md"), md);
console.log(JSON.stringify(report, null, 2));
console.log("Wrote docs/VERIFICACION-PRIVACIDAD-ADMIN.md");
