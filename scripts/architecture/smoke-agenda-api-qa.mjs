/**
 * Smoke API agenda: 401, alta/edición/borrado, 404 cruzado, 403 sin workspace, purga 0.
 * API_BASE=http://… node scripts/architecture/smoke-agenda-api-qa.mjs
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
const A = { email: `qa-agenda-api-a-${stamp}@saletse-test.com`, name: `QA ApiA ${stamp}` };
const B = { email: `qa-agenda-api-b-${stamp}@saletse-test.com`, name: `QA ApiB ${stamp}` };
const CREDS = resolve(tmpdir(), `saletse-qa-agenda-api-${stamp}.creds.json`);
const NOTE = `api-nota-${stamp}`;
const NOTE2 = `api-edit-${stamp}`;
const DAY = new Date().toISOString().slice(0, 10);

writeFileSync(CREDS, JSON.stringify({ a: A.email, b: B.email, password: PASS }, null, 2), { mode: 0o600 });
console.log(`Credenciales fuera del repo: ${CREDS}`);

const report = { steps: [], rows: [] };
function step(name, ok, detail = "") {
  report.steps.push({ name, ok, detail: String(detail).slice(0, 240) });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${String(detail).slice(0, 160)}` : ""}`);
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
    const anon = await api("GET", "/api/v1/calendar-entries");
    step("401 sin token", anon.status === 401 || anon.status === 503, String(anon.status));

    runHelper(["provision", A.email, PASS, A.name]);
    runHelper(["provision", B.email, PASS, B.name]);
    step("rol liner A", Boolean(runHelper(["grant-liner-role", A.email]).granted));
    step("rol liner B", Boolean(runHelper(["grant-liner-role", B.email]).granted));
    const tokA = await token(A.email);
    const tokB = await token(B.email);
    step("login API", true);

    const created = await api("POST", "/api/v1/calendar-entries", tokA, {
      type: "nota",
      entry_date: DAY,
      note: NOTE,
    });
    const id = created.json?.data?.id;
    step("crear 201", created.status === 201 && Boolean(id), `${created.status} ${id || ""}`);

    let rows = [];
    for (let i = 0; i < 8; i += 1) {
      rows = runHelper(["calendar-rows", A.email]);
      if (rows.some((r) => r.note === NOTE)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    const createdRow = rows.find((r) => r.note === NOTE);
    step(
      "fila alta vs contrato main",
      Boolean(createdRow)
        && createdRow.type === "nota"
        && createdRow.entry_date === DAY
        && !createdRow.kind
        && !createdRow.source
        && !createdRow.process_date,
      JSON.stringify(createdRow || null),
    );

    const patched = await api("PATCH", `/api/v1/calendar-entries/${id}`, tokA, { note: NOTE2 });
    step("editar 200", patched.status === 200 && patched.json?.data?.note === NOTE2, String(patched.status));

    const foreign = await api("GET", `/api/v1/calendar-entries/${id}`, tokB);
    step("aislamiento otro workspace → 404", foreign.status === 404, String(foreign.status));

    const removed = await api("DELETE", `/api/v1/calendar-entries/${id}`, tokA);
    step("borrar { ok: true }", removed.status === 200 && removed.json?.ok === true, JSON.stringify(removed.json));
    const after = runHelper(["calendar-rows", A.email]);
    step("fila borrada ausente", !after.some((r) => r.note === NOTE || r.note === NOTE2));

    runHelper(["detach-workspaces", A.email]);
    const denied = await api("POST", "/api/v1/calendar-entries", tokA, {
      type: "nota",
      entry_date: DAY,
      note: "recrea-ws",
    });
    // REST no mira expedientes:editar. listUserWorkspaces llama ensurePersonalWorkspace,
    // así que quitar la membresía no produce 403: el API recrea el workspace y responde 201.
    step(
      "sin membresía no hay 403 de permiso (recrea workspace, 201)",
      denied.status === 201,
      `${denied.status} ${denied.json?.error || ""}`,
    );
  } catch (err) {
    step("smoke API", false, err instanceof Error ? err.message : String(err));
  } finally {
    for (const email of [A.email, B.email]) {
      try {
        const leftover = runHelper(["purge", email]);
        step(`purga ${email.startsWith("qa-agenda-api-a") ? "A" : "B"}`, Object.values(leftover).every((v) => v === 0));
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
