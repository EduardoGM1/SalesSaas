/**
 * Smoke API del Tramo C de expediente.
 * 401, alta, edición, borrado, 403 sin permiso, aislamiento, share y purga.
 *
 * API_BASE=http://… node scripts/architecture/smoke-expediente-c-api-qa.mjs
 */
import { randomBytes } from "node:crypto";
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
const A = { email: `qa-expediente-c-a-${stamp}@saletse-test.com`, name: `QA ExpedienteC A ${stamp}` };
const B = { email: `qa-expediente-c-b-${stamp}@saletse-test.com`, name: `QA ExpedienteC B ${stamp}` };
const CREDS = resolve(tmpdir(), `saletse-qa-expediente-c-${stamp}.creds.json`);

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
  const url = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || "").replace(/\/$/, "");
  const anon = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Falta SUPABASE_URL/ANON");
  return { url, anon };
}
async function token(email) {
  const { url, anon } = supabaseEnv();
  let res;
  try {
    res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anon, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: PASS }),
    });
  } catch (err) {
    throw new Error(`token red ${err.cause?.code || err.message}`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`token ${res.status} ${body.error_code || body.error || ""}`.trim());
  return body.access_token;
}
function userId(tok) {
  const payload = JSON.parse(Buffer.from(tok.split(".")[1], "base64url").toString());
  return payload.sub;
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
function countsZero(leftover) {
  return leftover && typeof leftover === "object" && Object.values(leftover).every((v) => v === 0);
}

async function main() {
  try {
    const anon = await api("GET", "/api/v1/prospects");
    step("401 sin token", anon.status === 401 || anon.status === 503, String(anon.status));

    runHelper(["provision", A.email, PASS, A.name]);
    runHelper(["provision", B.email, PASS, B.name]);
    const tokA0 = await token(A.email);
    const denied = await api("POST", "/api/v1/prospects", tokA0, { name: "Antes" });
    step(
      "403 sin expedientes:crear",
      denied.status === 403,
      `${denied.status} ${denied.json?.code || ""}`,
    );

    step("rol liner A", Boolean(runHelper(["grant-liner-role", A.email]).granted));
    step("rol liner B", Boolean(runHelper(["grant-liner-role", B.email]).granted));
    const tokA = await token(A.email);
    const tokB = await token(B.email);

    const created = await api("POST", "/api/v1/prospects", tokA, { name: "Ana" });
    const id = created.json?.data?.id;
    step(
      "alta 201 { data }",
      created.status === 201 && Boolean(id) && created.json?.data?.name === "Ana" && created.json?.data?.name1 === "Ana",
      String(created.status),
    );

    const listed = await api("GET", "/api/v1/prospects?limit=10&offset=0", tokA);
    step(
      "listado { data, total, limit, offset }",
      listed.status === 200
        && Array.isArray(listed.json?.data)
        && listed.json.data.some((row) => row.id === id)
        && "total" in (listed.json || {})
        && listed.json.limit === 10
        && listed.json.offset === 0,
      String(listed.status),
    );

    const one = await api("GET", `/api/v1/prospects/${id}`, tokA);
    step("detalle { data }", one.status === 200 && one.json?.data?.id === id, String(one.status));

    const patched = await api("PATCH", `/api/v1/prospects/${id}`, tokA, { name: "Ana Edit" });
    step(
      "editar 200 conserva el id",
      patched.status === 200 && patched.json?.data?.id === id && patched.json?.data?.name === "Ana Edit",
      String(patched.status),
    );

    const foreign = await api("GET", `/api/v1/prospects/${id}`, tokB);
    step("aislamiento otro workspace → 404", foreign.status === 404, String(foreign.status));

    const bad = await api("GET", "/api/v1/prospects/no-es-uuid", tokA);
    step("id no uuid → 400", bad.status === 400, String(bad.status));

    const selfShare = await api("POST", `/api/v1/prospects/${id}/shares`, tokA, {
      shared_with_id: userId(tokA),
      permission: "view",
    });
    step("compartir consigo → 400", selfShare.status === 400, String(selfShare.status));

    const otherShare = await api("POST", `/api/v1/prospects/${id}/shares`, tokA, {
      shared_with_id: userId(tokB),
      permission: "view",
    });
    step("compartir fuera del workspace → 403", otherShare.status === 403, String(otherShare.status));

    const active = await api("GET", "/api/v1/prospects/active", tokA);
    step("activos sigue montado", active.status === 200, String(active.status));

    const removed = await api("DELETE", `/api/v1/prospects/${id}`, tokA);
    step("borrar { ok: true }", removed.status === 200 && removed.json?.ok === true, String(removed.status));
    const gone = await api("GET", `/api/v1/prospects/${id}`, tokA);
    step("borrado ausente → 404", gone.status === 404, String(gone.status));
  } catch (err) {
    step("smoke API expediente C", false, err instanceof Error ? err.message : String(err));
  } finally {
    for (const email of [A.email, B.email]) {
      try {
        const leftover = runHelper(["purge", email]);
        step(`purga ${email.includes("-a-") ? "A" : "B"}`, countsZero(leftover));
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
