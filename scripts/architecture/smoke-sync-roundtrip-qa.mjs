/**
 * Smoke post-deploy de PUT /sync contra la API real (QA efímera A y B, purga a 0).
 *
 * (a) Blob legacy con una fila nueva por tabla del sync → 200 y UNA fila por tabla en el
 *     workspace activo de A (confirma la búsqueda por created_at vía PostgREST).
 * (b) El mismo blob reenviado 3 veces con ids regenerados por normalizeIds → sin duplicados.
 * (c) Blob con un expediente de B (oculto para A): sin X-Sync-Protocol → 409 sync_partial sin
 *     data; con X-Sync-Protocol: 2 → 200 con partial/rejected.
 * (d) El expediente de B no se actualiza ni se reasigna.
 * Latencia de cada PUT en el reporte. `--pre`: solo el PUT de (a), para medir el estado previo.
 *
 * Uso: API_BASE=http://187.77.14.148 node scripts/architecture/smoke-sync-roundtrip-qa.mjs [--pre]
 * Credenciales aleatorias en %TEMP% (600), reporte sin contraseñas en ~/.saletse-ops.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeIds } from "@salesapp/shared/data/mappers.js";
import { emptyDatabase } from "@salesapp/shared/storage/types.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "../..");
const HELPER = resolve(__dir, "qa-geo-fx-ephemeral.py");
const API = (process.env.API_BASE ?? "http://187.77.14.148").replace(/\/$/, "");
const PRE = process.argv.includes("--pre");
const stamp = Date.now().toString(36);
const EMAIL_A = `qa-sync-a-${stamp}@saletse-test.com`;
const EMAIL_B = `qa-sync-b-${stamp}@saletse-test.com`;
const PASS = randomBytes(18).toString("base64url");
const CREDS = resolve(tmpdir(), `saletse-qa-sync-${stamp}.creds.json`);
const OPS = join(homedir(), ".saletse-ops");
const TABLES = ["prospects", "sales", "calendar_entries", "activities", "goals", "tool_calculations"];
const T0 = Date.parse("2026-10-05T15:00:00.000Z");

const report = { mode: PRE ? "pre" : "post", api: API, steps: [], latency_ms: [], fail: null };

writeFileSync(CREDS, JSON.stringify({ a: EMAIL_A, b: EMAIL_B, password: PASS }, null, 2), { mode: 0o600 });
mkdirSync(OPS, { recursive: true });

function step(name, ok, detail = "") {
  report.steps.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok && !report.fail) report.fail = name;
  return !!ok;
}

function must(name, ok, detail = "") {
  if (!step(name, ok, detail)) throw new Error(name);
}

function helper(args) {
  const r = spawnSync("python", [HELPER, ...args], { cwd: root, encoding: "utf8", timeout: 180000 });
  if (r.status !== 0) throw new Error(`helper ${args[0]}: ${(r.stderr || r.stdout || "").slice(0, 800)}`);
  const line = (r.stdout || "").trim().split(/\r?\n/).filter(Boolean).pop();
  return line ? JSON.parse(line) : {};
}

function supabaseEnv() {
  const env = { ...process.env };
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
  if (!res.ok || !body.access_token) throw new Error(`grant ${res.status}`);
  return body.access_token;
}

async function putSync(tok, db, { protocol } = {}) {
  const t = Date.now();
  const res = await fetch(`${API}/api/v1/sync`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${tok}`,
      "Content-Type": "application/json",
      ...(protocol ? { "X-Sync-Protocol": protocol } : {}),
    },
    body: JSON.stringify({ data: db }),
  });
  const ms = Date.now() - t;
  const body = await res.json().catch(() => ({}));
  report.latency_ms.push({ status: res.status, ms });
  return { status: res.status, body, ms };
}

/** Blob como el de un cliente desplegado: ids locales no-UUID, una fila nueva por tabla. */
function legacyBlob() {
  const db = emptyDatabase();
  db.clients["c-qa-1"] = {
    id: "c-qa-1",
    prospectCode: `QS-${stamp}`,
    name: "QaSync Uno",
    createdAt: T0,
    updatedAt: T0,
    data: { worksheet: { precio: 1 } },
    sales: [{ saleId: "s-qa-1", date: "2026-10-05", vol: 100, tours: 1, ts: T0 + 1000 }],
    activities: [{ id: "a-qa-1", type: "nota", title: "qa", ts: T0 + 2000, date: "2026-10-05" }],
  };
  db.clients["c-qa-2"] = { id: "c-qa-2", name: "QaSync Dos", createdAt: T0 + 5000, updatedAt: T0 + 5000, sales: [], activities: [] };
  db.cal["2026-10"] = { days: { 6: [{ id: "e-qa-1", t: "follow", ts: T0 + 3000, clientId: "c-qa-1" }] }, weeks: {} };
  db.goals["2026-10"] = { vol: 5, tours: 2, ventas: 1, dias: 20, desc: 0, updatedAt: T0 };
  return db;
}

function expectOnePerTable(state, label) {
  const want = { prospects: 2, sales: 1, calendar_entries: 1, activities: 1, goals: 1, tool_calculations: 1 };
  const got = Object.fromEntries(TABLES.map((t) => [t, state[t]?.total ?? -1]));
  const inWs = TABLES.every((t) => (state[t]?.en_ws_activo ?? -1) === want[t] && (state[t]?.ws_nulo ?? -1) === 0);
  const dups = (state.dup_prospect_code || 0) + (state.dup_prospect_natural || 0) + (state.dup_calendar_natural || 0);
  must(
    `${label}: una fila por entidad, en el workspace activo, sin duplicados`,
    JSON.stringify(got) === JSON.stringify(want) && inWs && dups === 0,
    `${JSON.stringify(got)} en_ws=${inWs} dups=${dups}`,
  );
}

async function main() {
  try {
    report.totals_pre = helper(["table-totals"]);
    helper(["provision", EMAIL_A, PASS, `QA SyncA ${stamp}`]);
    helper(["provision", EMAIL_B, PASS, `QA SyncB ${stamp}`]);
    for (const email of [EMAIL_A, EMAIL_B]) must("rol liner (permisos de un usuario real)", helper(["grant-liner-role", email]).granted);
    const tokA = await token(EMAIL_A);

    const first = await putSync(tokA, normalizeIds(legacyBlob()).db);
    if (PRE) {
      report.pre_status = first.status;
      report.pre_state = helper(["sync-state", EMAIL_A]);
      step("pre: PUT /sync con filas nuevas", true, `status=${first.status} ms=${first.ms} error=${String(first.body.error || "").slice(0, 80)}`);
      return;
    }

    // (a)
    must("(a) PUT con filas nuevas → 200 con data", first.status === 200 && first.body.data && !first.body.partial,
      `status=${first.status} ms=${first.ms}${first.body.code ? ` code=${first.body.code}` : ""}`);
    must("(a) data devuelve los 2 expedientes", Object.keys(first.body.data.clients || {}).length === 2);
    expectOnePerTable(helper(["sync-state", EMAIL_A]), "(a)");

    // (b)
    const sentIds = new Set(Object.keys(normalizeIds(legacyBlob()).db.clients));
    for (let i = 0; i < 3; i += 1) {
      const { db } = normalizeIds(legacyBlob());
      Object.keys(db.clients).forEach((id) => sentIds.add(id));
      const r = await putSync(tokA, db);
      must(`(b) reenvío ${i + 1} → 200`, r.status === 200, `status=${r.status} ms=${r.ms}`);
    }
    step("(b) los reenvíos llevaban ids distintos", sentIds.size >= 6, `ids_expediente_distintos=${sentIds.size}`);
    expectOnePerTable(helper(["sync-state", EMAIL_A]), "(b) tras 3 reenvíos");

    // (c) + (d)
    const pB = randomUUID();
    helper(["seed-prospect", EMAIL_B, pB, "QaSyncB", `QB-${stamp}`]);
    const withForeign = () => {
      const { db } = normalizeIds(legacyBlob());
      db.clients[pB] = { id: pB, prospectCode: `QX-${stamp}`, name: "PISADO", createdAt: T0 + 9000, updatedAt: Date.now(), sales: [], activities: [] };
      return db;
    };
    const v1 = await putSync(tokA, withForeign());
    must("(c) sin cabecera → 409 sync_partial sin data",
      v1.status === 409 && v1.body.code === "sync_partial" && v1.body.data === undefined,
      `status=${v1.status} code=${v1.body.code} counts=${JSON.stringify(v1.body.rejected_counts)}`);
    must("(c) motivo conflicto_oculto en prospects",
      (v1.body.rejected || []).some((r) => r.table === "prospects" && r.code === "conflicto_oculto"));
    const v2 = await putSync(tokA, withForeign(), { protocol: "2" });
    must("(c) con X-Sync-Protocol: 2 → 200 partial con rejected y data",
      v2.status === 200 && v2.body.partial === true && Array.isArray(v2.body.rejected) && v2.body.data,
      `status=${v2.status} rejected=${(v2.body.rejected || []).length}`);
    const chk = helper(["prospect-check", EMAIL_B, pB]);
    must("(d) la fila de B sigue siendo de B, en su workspace y sin cambios",
      chk.exists === 1 && chk.owner_is_email && chk.ws_of_owner && chk.name === "QaSyncB", JSON.stringify(chk));
    expectOnePerTable(helper(["sync-state", EMAIL_A]), "(c/d) A sin duplicados tras los PUT parciales");
  } catch (err) {
    step("error", false, err instanceof Error ? err.message : String(err));
  } finally {
    for (const [label, email] of [["B", EMAIL_B], ["A", EMAIL_A]]) {
      try {
        const left = helper(["purge", email]);
        step(`purga ${label} a 0`, Object.values(left).every((v) => v === 0), JSON.stringify(left));
      } catch (e) {
        step(`purga ${label}`, false, String(e).slice(0, 200));
      }
    }
    try {
      report.totals_post = helper(["table-totals"]);
    } catch {
      /* */
    }
    try {
      unlinkSync(CREDS);
    } catch {
      /* */
    }
    const out = join(OPS, `sync-roundtrip-${report.mode}-${stamp}.json`);
    writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(`\nreporte: ${out}`);
    console.log(JSON.stringify({ fail: report.fail, latency_ms: report.latency_ms, totals_pre: report.totals_pre, totals_post: report.totals_post }));
  }
  process.exit(report.fail ? 1 : 0);
}

main();
