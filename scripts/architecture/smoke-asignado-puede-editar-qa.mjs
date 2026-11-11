/**
 * Smoke D7 — colaborador asignado en workflow: can_edit + PATCH ficha (QA).
 *
 * Tras desplegar migración 0104 + API `acceso-edicion` / `prospectos-servicio`, verifica:
 *  1. Usuarios efímeros A (owner/liner) + B/C (collab) o tokens/PROSPECT_ID por env.
 *  2. Expediente en sala_de_venta (GET …/participants exige sala; personal → GAP).
 *  3. GET /api/v1/prospects/:id/participants → capabilities.can_edit para liner_id (B) y opc_id (C).
 *  4. PATCH /api/v1/prospects/:id (note) → 200 asignado; 403 sin asignación.
 *  5. can_register_sale === false para liner (no cerrador).
 *  6. JSON en ~/.saletse-ops/smoke-asignado-puede-editar-*.json (sin passwords).
 *
 * Variables de entorno (requeridas / opcionales):
 *   API_BASE           — API QA (default http://187.77.14.148). No ejecutar contra prod sin acuerdo.
 *   VPS auth overlay   — %TEMP%/saletse-vps-auth-overlay.env o .env.local con SUPABASE_URL + ANON
 *                        (URL Kong VPS; rechaza host *.supabase.co).
 *   QA_SALA_WORKSPACE_ID — UUID sala_de_venta QA (≠ Sala RH). Ej. «Sala QA P0» de qa-rh-p0-prod-verify.
 *   PROSPECT_ID        — Reutilizar expediente existente (opcional).
 *   SMOKE_ALLOW_RH=1   — Permite prospect en sala RH (b0b1c8b0-…) vía --allow-rh en helper.
 *   TOKEN_OWNER, TOKEN_B_ASSIGNED, TOKEN_C_UNASSIGNED — Modo manual (cuentas RH prueba u ops).
 *     Pre-asignar liner_id vía: python …/qa-geo-fx-ephemeral.py seed-workflow-collab <id> liner_id <email|uuid>
 *   QA_EPHEMERAL_PASSWORD — Solo si reutilizas emails @saletse-test.com fijos con password conocida.
 *
 * GAP: sin seed-sala-roles-ephemeral completo; hace falta QA_SALA_WORKSPACE_ID o PROSPECT_ID+tokens.
 * Nunca mutar miembros/roles de la Sala RH real salvo SMOKE_ALLOW_RH explícito.
 *
 * Uso:
 *   API_BASE=http://187.77.14.148 QA_SALA_WORKSPACE_ID=<uuid-sala-qa> \
 *     node scripts/architecture/smoke-asignado-puede-editar-qa.mjs
 */
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "../..");
const HELPER = resolve(__dir, "qa-geo-fx-ephemeral.py");
const API = (process.env.API_BASE ?? "http://187.77.14.148").replace(/\/$/, "");
const SALA_RH_ID = "b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815";
const QA_SALA = (process.env.QA_SALA_WORKSPACE_ID || "").trim();
const ALLOW_RH = process.env.SMOKE_ALLOW_RH === "1" || process.env.SMOKE_ALLOW_RH === "true";
const stamp = Date.now().toString(36);
const PASS = process.env.QA_EPHEMERAL_PASSWORD || randomBytes(18).toString("base64url");

const A = { email: `qa-d7-a-${stamp}@saletse-test.com`, name: `QA D7 Owner ${stamp}` };
const B = { email: `qa-d7-b-${stamp}@saletse-test.com`, name: `QA D7 Liner ${stamp}` };
const C = { email: `qa-d7-c-${stamp}@saletse-test.com`, name: `QA D7 OPC ${stamp}` };

const CREDS = resolve(tmpdir(), `saletse-qa-d7-${stamp}.creds.json`);
const OPS = join(homedir(), ".saletse-ops");
const OUT = join(OPS, `smoke-asignado-puede-editar-${stamp}.json`);

mkdirSync(OPS, { recursive: true });

const report = {
  api: API,
  stamp,
  feature: "D7 asignado-puede-editar",
  steps: [],
  gaps: [],
  skips: [],
  prospect_id: null,
  mode: null,
  leftover: {},
};

function step(name, ok, detail = "") {
  report.steps.push({ name, ok: !!ok, detail: String(detail).slice(0, 400) });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${String(detail).slice(0, 220)}` : ""}`);
  return !!ok;
}

function runHelper(args) {
  const r = spawnSync("python", [HELPER, ...args], { cwd: root, encoding: "utf8", timeout: 180000 });
  if (r.status !== 0) throw new Error(`helper ${args[0]}: ${(r.stderr || r.stdout || "").slice(0, 800)}`);
  const line = (r.stdout || "").trim().split(/\r?\n/).filter(Boolean).pop();
  return line ? JSON.parse(line) : {};
}

function supabaseEnv() {
  const overlay = {};
  const local = {};
  for (const [f, dest] of [
    [resolve(tmpdir(), "saletse-vps-auth-overlay.env"), overlay],
    [resolve(root, ".env.local"), local],
    [resolve(root, ".env"), local],
  ]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const i = line.indexOf("=");
      if (!line || line.startsWith("#") || i < 0) continue;
      const k = line.slice(0, i).trim();
      if (dest[k]) continue;
      dest[k] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
    }
  }
  const url = (
    overlay.VITE_SUPABASE_URL
    || overlay.SUPABASE_URL
    || process.env.SUPABASE_URL
    || process.env.VITE_SUPABASE_URL
    || local.VITE_SUPABASE_URL
    || local.SUPABASE_URL
    || ""
  ).replace(/\/$/, "");
  const anon =
    overlay.VITE_SUPABASE_ANON_KEY
    || overlay.SUPABASE_ANON_KEY
    || process.env.SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || local.VITE_SUPABASE_ANON_KEY
    || local.SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Falta SUPABASE_URL/ANON (overlay VPS o .env.local)");
  if (/supabase\.co/i.test(url)) {
    throw new Error(`URL cloud inválida para smoke QA VPS: ${url.split("/")[2]}`);
  }
  return { url, anon };
}

async function tokenFromPassword(email, password = PASS) {
  const { url, anon } = supabaseEnv();
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(`token ${email} ${res.status} ${body.error_code || body.error || ""}`.trim());
  }
  return body.access_token;
}

function userIdFromJwt(tok) {
  try {
    return JSON.parse(Buffer.from(tok.split(".")[1], "base64url").toString()).sub;
  } catch {
    return null;
  }
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

function capsFromParticipants(res) {
  const data = res.json?.data ?? res.json;
  return data?.capabilities ?? null;
}

function countsZero(leftover) {
  return leftover && typeof leftover === "object" && Object.values(leftover).every((v) => v === 0);
}

function assertSalaAllowed(wsId) {
  if (wsId === SALA_RH_ID && !ALLOW_RH) {
    throw new Error(`QA_SALA o prospect en Sala RH (${SALA_RH_ID}); define SMOKE_ALLOW_RH=1 si es intencional`);
  }
}

function helperAllowRhArgs() {
  return ALLOW_RH ? ["--allow-rh"] : [];
}

async function runManualMode() {
  const pid = process.env.PROSPECT_ID?.trim();
  const tokA = process.env.TOKEN_OWNER?.trim();
  const tokB = process.env.TOKEN_B_ASSIGNED?.trim();
  const tokC = process.env.TOKEN_C_UNASSIGNED?.trim();
  if (!pid || !tokA || !tokB) {
    report.gaps.push("Modo manual: faltan PROSPECT_ID, TOKEN_OWNER y/o TOKEN_B_ASSIGNED");
    return false;
  }
  report.mode = "manual_tokens";
  report.prospect_id = pid;
  return runAssertions({ pid, tokA, tokB, tokC, uidB: userIdFromJwt(tokB), uidC: tokC ? userIdFromJwt(tokC) : null });
}

async function runEphemeralMode() {
  if (!QA_SALA) {
    report.gaps.push(
      "GAP sala efímera: define QA_SALA_WORKSPACE_ID (sala_de_venta QA, no RH) o usa PROSPECT_ID+tokens",
    );
    step("precondición QA_SALA_WORKSPACE_ID", false, "no definido");
    return false;
  }
  assertSalaAllowed(QA_SALA);
  report.mode = "ephemeral_sala";
  writeFileSync(
    CREDS,
    JSON.stringify({ a: A.email, b: B.email, c: C.email, password: PASS, sala: QA_SALA, created_at: new Date().toISOString() }, null, 2),
    { mode: 0o600 },
  );
  console.log(`Credenciales fuera del repo: ${CREDS}`);

  const uidA = runHelper(["provision", A.email, PASS, A.name]).uid;
  const uidB = runHelper(["provision", B.email, PASS, B.name]).uid;
  const uidC = runHelper(["provision", C.email, PASS, C.name]).uid;
  step("provision A+B+C", Boolean(uidA && uidB && uidC));

  for (const [email] of [[A.email], [B.email], [C.email]]) {
    runHelper(["join-workspace-ephemeral", email, QA_SALA, "vendedor"]);
    runHelper(["set-active-workspace", email, QA_SALA]);
  }
  step("join + workspace activo sala QA", true, QA_SALA.slice(0, 8));

  step("grant-liner A", Boolean(runHelper(["grant-liner-role", A.email]).granted));

  const tokA = await tokenFromPassword(A.email);
  const tokB = await tokenFromPassword(B.email);
  const tokC = await tokenFromPassword(C.email);
  step("password grant A+B+C", true);

  let pid = process.env.PROSPECT_ID?.trim() || null;
  if (!pid) {
    const created = await api("POST", "/api/v1/prospects", tokA, { name: `D7Smoke ${stamp}` });
    pid = created.json?.data?.id || null;
    step("Owner A alta expediente sala", created.status === 201 && Boolean(pid), String(created.status));
  } else {
    step("PROSPECT_ID reutilizado", true, pid.slice(0, 8));
  }
  if (!pid) return false;
  report.prospect_id = pid;

  runHelper([
    "seed-workflow-collab", pid, "liner_id", uidB, ...helperAllowRhArgs(),
  ]);
  step("seed-workflow-collab liner_id → B", true, uidB.slice(0, 8));

  const ok = await runAssertions({ pid, tokA, tokB, tokC, uidB, uidC });

  runHelper(["seed-workflow-collab", pid, "opc_id", uidC, ...helperAllowRhArgs()]);
  step("seed-workflow-collab opc_id → C", true);
  const partC = await api("GET", `/api/v1/prospects/${pid}/participants`, tokC);
  const capsC = capsFromParticipants(partC);
  step(
    "C asignado opc_id can_edit",
    partC.status === 200 && capsC?.can_edit === true,
    `status=${partC.status} can_edit=${capsC?.can_edit}`,
  );

  return ok && partC.status === 200 && capsC?.can_edit === true;
}

async function runAssertions({ pid, tokA, tokB, tokC, uidB, uidC }) {
  const partB = await api("GET", `/api/v1/prospects/${pid}/participants`, tokB);
  const capsB = capsFromParticipants(partB);
  const editOk = partB.status === 200 && capsB?.can_edit === true;
  step(
    "B liner_id GET participants can_edit",
    editOk,
    `status=${partB.status} can_edit=${capsB?.can_edit}`,
  );
  step(
    "B liner can_register_sale false",
    capsB?.can_register_sale === false,
    `can_register_sale=${capsB?.can_register_sale}`,
  );

  const patchB = await api("PATCH", `/api/v1/prospects/${pid}`, tokB, {
    note: `d7-smoke-${stamp}`,
  });
  step(
    "B asignado PATCH note 200",
    patchB.status === 200,
    `status=${patchB.status} code=${patchB.json?.code || ""}`,
  );
  if (patchB.status === 403 && editOk) {
    report.skips.push(
      "PATCH 403 con can_edit true: posible requireWorkspacePermission(expedientes:editar) sin desplegar fix API",
    );
  }

  if (tokC) {
    const partC0 = await api("GET", `/api/v1/prospects/${pid}/participants`, tokC);
    const capsC0 = capsFromParticipants(partC0);
    const noEdit =
      partC0.status === 403
      || capsC0?.can_edit === false;
    step(
      "C sin asignación can_edit false o 403",
      noEdit,
      `status=${partC0.status} can_edit=${capsC0?.can_edit}`,
    );
    const patchC = await api("PATCH", `/api/v1/prospects/${pid}`, tokC, { note: "d7-deny" });
    step("C sin asignación PATCH 403", patchC.status === 403, String(patchC.status));
  } else if (uidB && uidC === null) {
    report.skips.push("Sin TOKEN_C: omitido bloque negativo sin asignación");
  }

  // Owner sigue pudiendo editar
  const patchA = await api("PATCH", `/api/v1/prospects/${pid}`, tokA, { note: `d7-owner-${stamp}` });
  step("Owner PATCH 200", patchA.status === 200, String(patchA.status));

  return editOk && capsB?.can_register_sale === false;
}

async function main() {
  let ephemeralPurge = false;
  try {
    const health = await api("GET", "/health");
    step("API health", health.status === 200, String(health.status));

    const manual =
      process.env.PROSPECT_ID && (process.env.TOKEN_OWNER || process.env.TOKEN_B_ASSIGNED);

    let ok;
    if (manual) {
      ok = await runManualMode();
    } else {
      ephemeralPurge = true;
      ok = await runEphemeralMode();
    }

    if (report.gaps.length) {
      for (const g of report.gaps) console.log(`GAP: ${g}`);
    }
    report.ok = ok && report.steps.every((s) => s.ok);
  } catch (err) {
    step("runner", false, err instanceof Error ? err.message : String(err));
    report.ok = false;
  } finally {
    if (ephemeralPurge) {
      for (const [label, email] of [["C", C.email], ["B", B.email], ["A", A.email]]) {
        try {
          const leftover = runHelper(["purge", email]);
          report.leftover[label] = leftover;
          step(`purga ${label}`, countsZero(leftover), JSON.stringify(leftover));
        } catch (e) {
          step(`purga ${label}`, false, e instanceof Error ? e.message : String(e));
        }
      }
    }
    try {
      if (existsSync(CREDS)) unlinkSync(CREDS);
    } catch { /* ignore */ }

    const failed = report.steps.filter((s) => !s.ok);
    report.failed_steps = failed.map((s) => s.name);
    writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(`\nreporte (sin password): ${OUT}`);
    console.log(JSON.stringify({
      ok: report.ok,
      mode: report.mode,
      prospect_id: report.prospect_id,
      failed_steps: report.failed_steps,
      gaps: report.gaps,
      skips: report.skips,
    }, null, 2));
  }
  process.exit(report.ok ? 0 : 1);
}

main();
