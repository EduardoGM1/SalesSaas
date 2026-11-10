/**
 * Smoke API del Tramo C de ventas.
 * 401, alta, edición, borrado, 403 sin ventas:registrar, aislamiento, filas y purga.
 *
 * API_BASE=http://… node scripts/architecture/smoke-ventas-c-api-qa.mjs
 */
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "../..");
const HELPER = resolve(__dir, "qa-geo-fx-ephemeral.py");
const API = (process.env.API_BASE ?? "http://187.77.14.148").replace(/\/$/, "");
const stamp = Date.now().toString(36);
const PASS = randomBytes(18).toString("base64url");
const A = { email: `qa-ventas-c-a-${stamp}@saletse-test.com`, name: `QA VentasC A ${stamp}` };
const B = { email: `qa-ventas-c-b-${stamp}@saletse-test.com`, name: `QA VentasC B ${stamp}` };
const CREDS = resolve(tmpdir(), `saletse-qa-ventas-c-${stamp}.creds.json`);
const FOLIO = `VC${stamp.slice(-6)}`;
const DAY = "2026-11-09";
const PROSPECT = randomUUID();

writeFileSync(CREDS, JSON.stringify({ a: A.email, b: B.email, password: PASS }, null, 2), { mode: 0o600 });
console.log(`Credenciales fuera del repo: ${CREDS}`);

const report = { steps: [] };
function step(name, ok, detail = "") {
  report.steps.push({ name, ok, detail: String(detail).slice(0, 240) });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${String(detail).slice(0, 180)}` : ""}`);
}
function runHelper(args) {
  const r = spawnSync("python", [HELPER, ...args], { cwd: root, encoding: "utf8", timeout: 180000 });
  if (r.status !== 0) throw new Error(`helper ${args[0]}: ${(r.stderr || r.stdout || "").slice(0, 500)}`);
  const line = (r.stdout || "").trim().split(/\r?\n/).filter(Boolean).pop();
  return line ? JSON.parse(line) : {};
}
function supabaseEnv() {
  const env = {};
  for (const f of [resolve(tmpdir(), "saletse-vps-auth-overlay.env"), resolve(root, ".env.local"), resolve(root, ".env")]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const i = line.indexOf("=");
      if (!line || line.startsWith("#") || i < 0) continue;
      const k = line.slice(0, i).trim();
      if (!env[k]) env[k] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
    }
  }
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Falta SUPABASE_URL/ANON");
  return { url, anon };
}
async function token(email) {
  const { url, anon } = supabaseEnv();
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASS }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`token ${res.status}`);
  return body.access_token;
}
async function api(method, path, tok, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function main() {
  try {
    const anon = await api("GET", "/api/v1/sales");
    step("401 sin token", anon.status === 401 || anon.status === 503, String(anon.status));

    runHelper(["provision", A.email, PASS, A.name]);
    runHelper(["provision", B.email, PASS, B.name]);
    runHelper(["seed-prospect", A.email, PROSPECT, "VentaC", `vc${stamp.slice(-4)}`]);
    const tokA = await token(A.email);
    const denied = await api("POST", "/api/v1/sales", tokA, {
      prospect_id: PROSPECT,
      sale_date: DAY,
      vol: 1500,
      contract: FOLIO,
      status: "venta",
    });
    step(
      "403 sin ventas:registrar",
      denied.status === 403,
      `${denied.status} ${denied.json?.code || denied.json?.error || ""}`,
    );

    step("rol liner A", Boolean(runHelper(["grant-liner-role", A.email]).granted));
    step("rol liner B", Boolean(runHelper(["grant-liner-role", B.email]).granted));
    const tokB = await token(B.email);

    const created = await api("POST", "/api/v1/sales", tokA, {
      prospect_id: PROSPECT,
      sale_date: DAY,
      vol: 1500,
      contract: FOLIO,
      status: "venta",
    });
    const id = created.json?.data?.id;
    step(
      "alta 201 { data }",
      created.status === 201 && Boolean(id) && created.json?.data?.sale_date === DAY,
      String(created.status),
    );

    let rows = [];
    for (let i = 0; i < 8; i += 1) {
      rows = runHelper(["sales-rows", A.email]);
      if (rows.some((r) => r.contract === FOLIO)) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    const sale = rows.find((r) => r.contract === FOLIO);
    step(
      "fila sales vs main",
      Boolean(sale) && sale.status === "venta" && sale.sale_date === DAY && Number(sale.vol) === 1500 && sale.processing === "venta" && !sale.process_date,
      JSON.stringify(sale || null),
    );

    const listed = await api("GET", `/api/v1/sales?limit=50&offset=0`, tokA);
    step(
      "listado { data, total, limit, offset }",
      listed.status === 200 && Array.isArray(listed.json?.data) && "total" in (listed.json || {}) && listed.json.limit === 50 && listed.json.offset === 0,
      String(listed.status),
    );

    const patched = await api("PATCH", `/api/v1/sales/${id}`, tokA, { note: "editada", vol: 1500 });
    step("editar 200", patched.status === 200 && patched.json?.data?.vol === 1500, String(patched.status));
    const afterEdit = runHelper(["sales-rows", A.email]).find((r) => r.contract === FOLIO);
    step(
      "edición conserva fecha, volumen y estado",
      Boolean(afterEdit) && afterEdit.sale_date === DAY && Number(afterEdit.vol) === 1500 && afterEdit.status === "venta" && !afterEdit.process_date,
      JSON.stringify(afterEdit || null),
    );

    const foreign = await api("GET", `/api/v1/sales/${id}`, tokB);
    step("aislamiento otro workspace → 404", foreign.status === 404, String(foreign.status));

    const bad = await api("GET", "/api/v1/sales/no-es-uuid", tokA);
    step("id no uuid → 400", bad.status === 400, String(bad.status));

    const removed = await api("DELETE", `/api/v1/sales/${id}`, tokA);
    step("borrar { ok: true }", removed.status === 200 && removed.json?.ok === true, JSON.stringify(removed.json));
    const gone = runHelper(["sales-rows", A.email]);
    step("fila borrada ausente", !gone.some((r) => r.contract === FOLIO));
  } catch (err) {
    step("smoke API ventas C", false, err instanceof Error ? err.message : String(err));
  } finally {
    for (const email of [A.email, B.email]) {
      try {
        const leftover = runHelper(["purge", email]);
        step(`purga ${email.includes("-a-") ? "A" : "B"}`, Object.values(leftover).every((v) => v === 0));
      } catch (e) {
        step("purga", false, e instanceof Error ? e.message : String(e));
      }
    }
    try { unlinkSync(CREDS); } catch { /* ignore */ }
  }
  const failed = report.steps.filter((s) => !s.ok);
  console.log(JSON.stringify({ ok: failed.length === 0, failed: failed.map((f) => f.name) }, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main();
