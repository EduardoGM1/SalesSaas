/**
 * Smoke D7 mínimo (WS personal): asignación collab ⇒ PATCH ficha.
 * No usa /participants (409 fuera de sala). Valida API updateProspect + RLS 0104.
 *
 * $env:API_BASE="http://187.77.14.148"; node scripts/architecture/smoke-d7-edit-personal-qa.mjs
 */
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "../..");
const HELPER = resolve(__dir, "qa-geo-fx-ephemeral.py");
const API = (process.env.API_BASE ?? "http://187.77.14.148").replace(/\/$/, "");
const stamp = Date.now().toString(36);
const PASS = randomBytes(18).toString("base64url");
const A = { email: `qa-d7p-a-${stamp}@saletse-test.com`, name: `QA D7p A ${stamp}` };
const B = { email: `qa-d7p-b-${stamp}@saletse-test.com`, name: `QA D7p B ${stamp}` };
const OPS = resolve(homedir(), ".saletse-ops");
mkdirSync(OPS, { recursive: true });
const report = { stamp, api: API, steps: [] };

function step(name, ok, detail = "") {
  report.steps.push({ name, ok, detail: String(detail).slice(0, 300) });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${String(detail).slice(0, 180)}` : ""}`);
}
function runHelper(args) {
  const r = spawnSync("python", [HELPER, ...args], { cwd: root, encoding: "utf8", timeout: 180000 });
  if (r.status !== 0) throw new Error(`helper ${args[0]}: ${(r.stderr || r.stdout || "").slice(0, 600)}`);
  const line = (r.stdout || "").trim().split(/\r?\n/).filter(Boolean).pop();
  return line ? JSON.parse(line) : {};
}
function supabaseEnv() {
  const env = {};
  for (const f of [resolve(tmpdir(), "saletse-vps-auth-overlay.env"), resolve(root, ".env.local")]) {
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
  if (!url || !anon) throw new Error("Falta overlay SUPABASE");
  if (url.includes("supabase.co")) throw new Error("Rechazado cloud supabase.co");
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
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function main() {
  try {
    runHelper(["provision", A.email, PASS, A.name]);
    runHelper(["provision", B.email, PASS, B.name]);
    runHelper(["grant-liner-role", A.email]);
    runHelper(["grant-liner-role", B.email]);
    step("provision+liner", true);

    const tokA = await token(A.email);
    const created = await api("POST", "/api/v1/prospects", tokA, { name: `D7p-${stamp}`, name1: `D7p-${stamp}` });
    const id = created.json?.data?.id;
    step("alta A", created.status === 201 && Boolean(id), String(created.status));
    if (!id) throw new Error("sin prospect id");

    const guest = runHelper(["seed-ws-guest", A.email, B.email]);
    step("guest B + overrides", Boolean(guest.workspace_id), JSON.stringify(guest));
    const collab = runHelper(["seed-workflow-collab", id, "liner_id", B.email]);
    step("liner_id=B", Boolean(collab.profile_id), JSON.stringify(collab));

    const tokB = await token(B.email);
    const patchOk = await api("PATCH", `/api/v1/prospects/${id}`, tokB, { name1: `D7p-edit-${stamp}` });
    step("B asignado PATCH 200", patchOk.status === 200, `${patchOk.status} ${patchOk.json?.code || ""}`);

    runHelper(["seed-workflow-collab", id, "liner_id", "null"]);
    const patchDeny = await api("PATCH", `/api/v1/prospects/${id}`, tokB, { name1: `D7p-deny-${stamp}` });
    step("B sin asignación PATCH 403/404", patchDeny.status === 403 || patchDeny.status === 404, String(patchDeny.status));

    runHelper(["seed-workflow-collab", id, "opc_id", B.email]);
    const patchOpc = await api("PATCH", `/api/v1/prospects/${id}`, tokB, { name1: `D7p-opc-${stamp}` });
    step("B opc_id PATCH 200", patchOpc.status === 200, String(patchOpc.status));

    const part = await api("GET", `/api/v1/prospects/${id}/participants`, tokB);
    step("participants en personal = 409 (esperado)", part.status === 409, String(part.status));
  } catch (err) {
    step("fatal", false, err.message || String(err));
    report.error = err.message || String(err);
  } finally {
    try {
      runHelper(["purge", A.email]);
      runHelper(["purge", B.email]);
      step("purge", true);
    } catch (e) {
      step("purge", false, e.message || String(e));
    }
    const out = resolve(OPS, `smoke-d7-edit-personal-${stamp}.json`);
    writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(`Reporte: ${out}`);
    process.exitCode = report.steps.some((s) => !s.ok) ? 1 : 0;
  }
}

main();
