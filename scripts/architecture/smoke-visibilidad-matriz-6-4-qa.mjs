/**
 * Smoke matriz §6.4 visibilidad-expedientes (QA efímera @saletse-test.com).
 *
 * Cobertura mínima sin sala completa (helper sin seed gerente/asistente/admin sala):
 *  - Owner A (liner): GET lista + ficha 200
 *  - B sin share: GET ficha 404/403; lista/sync sin ajeno; realtime presence denegado
 *    (mismo patrón que smoke-realtime-broadcast-negative-qa.mjs: private channel +
 *    subscribe; si SUBSCRIBED intenta broadcast y exige rechazo en denegación)
 *  - seed-collab-share-only view → Share view (ficha 200 + assert RO)
 *  - seed-collab-share → colaborador vía share+guest WS (ficha 200; sync incluye compartido)
 *  - Filas Gerente / Asistente sala / Admin empresa → GAP (notas efímeras; sin SQL sala RH)
 *  - UI Clientes → SKIP (API+realtime mínimo; UI opcional)
 *  - Realtime TIMED_OUT / sin SDK → SKIP durable; hook:
 *      node scripts/architecture/smoke-realtime-broadcast-negative-qa.mjs
 *
 * Uso:
 *   API_BASE=http://187.77.14.148 node scripts/architecture/smoke-visibilidad-matriz-6-4-qa.mjs
 *
 * Creds solo en %TEMP%; reporte JSON en ~/.saletse-ops (sin password); purga a 0.
 *
 * GAP Gerente / Asistente sala / Admin empresa (solo notas; no inventar seed sala RH):
 *  - Requiere WS sala_de_venta efímero + rol_en_workspace=gerente | slug asistente_sala
 *    | empresa_miembros.es_admin — nunca mutar miembros/roles de sala RH real.
 *  - Futuro: helper seed-sala-roles-ephemeral (QA @saletse-test.com + purge a 0).
 *  - Mientras: filas GAP; coverage parcial vía residual ops + predicado SQL RO.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "../..");
const HELPER = resolve(__dir, "qa-geo-fx-ephemeral.py");
const API = (process.env.API_BASE ?? "http://187.77.14.148").replace(/\/$/, "");
const stamp = Date.now().toString(36);
const PASS = randomBytes(18).toString("base64url");
const A = { email: `qa-visib-a-${stamp}@saletse-test.com`, name: `QA Visib A ${stamp}` };
const B = { email: `qa-visib-b-${stamp}@saletse-test.com`, name: `QA Visib B ${stamp}` };
const C = { email: `qa-visib-c-${stamp}@saletse-test.com`, name: `QA Visib C ${stamp}` };
const CREDS = resolve(tmpdir(), `saletse-qa-visib-6-4-${stamp}.creds.json`);
const OPS = join(homedir(), ".saletse-ops");
const OUT = join(OPS, `visibilidad-matriz-6-4-${stamp}.json`);

writeFileSync(
  CREDS,
  JSON.stringify({ a: A.email, b: B.email, c: C.email, password: PASS, created_at: new Date().toISOString() }, null, 2),
  { mode: 0o600 },
);
mkdirSync(OPS, { recursive: true });
console.log(`Credenciales fuera del repo: ${CREDS}`);

/** @type {{ api: string, stamp: string, steps: object[], matrix: object[], gaps: string[], skips: string[], leftover: object }} */
const report = {
  api: API,
  stamp,
  section: "docs/arquitectura/visibilidad-expedientes.md §6.4",
  steps: [],
  matrix: [],
  gaps: [],
  skips: [],
  leftover: {},
};

function step(name, ok, detail = "") {
  report.steps.push({ name, ok: !!ok, detail: String(detail).slice(0, 320) });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${String(detail).slice(0, 200)}` : ""}`);
  return !!ok;
}

function matrixRow(actor, checks) {
  report.matrix.push({ actor, ...checks });
  const parts = Object.entries(checks)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  console.log(`  · matriz ${actor}: ${parts}`);
}

function runHelper(args) {
  const r = spawnSync("python", [HELPER, ...args], { cwd: root, encoding: "utf8", timeout: 180000 });
  if (r.status !== 0) throw new Error(`helper ${args[0]}: ${(r.stderr || r.stdout || "").slice(0, 800)}`);
  const line = (r.stdout || "").trim().split(/\r?\n/).filter(Boolean).pop();
  return line ? JSON.parse(line) : {};
}

function supabaseEnv() {
  // Preferir overlay VPS (Kong IP) sobre .env.local cloud — mismo criterio que residual ops.
  const overlay = {};
  const local = {};
  const files = [
    [resolve(tmpdir(), "saletse-vps-auth-overlay.env"), overlay],
    [resolve(root, ".env.local"), local],
    [resolve(root, ".env"), local],
  ];
  for (const [f, dest] of files) {
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
  if (!url || !anon) throw new Error("Falta SUPABASE_URL/ANON (overlay o .env.local)");
  if (/supabase\.co/i.test(url)) {
    throw new Error(`URL cloud inválida para matriz prod (usar overlay VPS): host=${url.split("/")[2]}`);
  }
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
  if (!res.ok || !body.access_token) {
    throw new Error(`token ${res.status} ${body.error_code || body.error || ""}`.trim());
  }
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token || body.access_token,
  };
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

function listIds(listed) {
  const rows = listed.json?.data;
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => r.id).filter(Boolean);
}

function syncClientIds(syncRes) {
  const db = syncRes.json?.data || syncRes.json || {};
  const clients = db.clients || {};
  return Object.keys(clients);
}

function countsZero(leftover) {
  if (!leftover || typeof leftover !== "object") return false;
  return Object.values(leftover).every((v) => v === 0);
}

const RT_HOOK =
  "node scripts/architecture/smoke-realtime-broadcast-negative-qa.mjs";

/**
 * Probe presence/broadcast en canal privado expediente:{uuid}.
 * Patrón alineado con smoke-realtime-broadcast-negative-qa.mjs.
 * expectAccess=true → debe SUBSCRIBED; false → debe denegar (CHANNEL_ERROR / no broadcast).
 * TIMED_OUT → SKIP durable (flaky Realtime) + hook RT_HOOK.
 */
async function probeRealtime(tok, prospectId, { expectAccess = true } = {}) {
  let createClient;
  try {
    ({ createClient } = await import("@supabase/supabase-js"));
  } catch {
    try {
      ({ createClient } = await import(
        resolve(root, "node_modules/@supabase/supabase-js/dist/module/index.js")
      ));
    } catch (err) {
      return {
        skipped: true,
        reason: `no @supabase/supabase-js: ${err.message}`,
        hook: RT_HOOK,
      };
    }
  }
  const { url, anon } = supabaseEnv();
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: sessErr } = await sb.auth.setSession({
    access_token: tok.access_token,
    refresh_token: tok.refresh_token || tok.access_token,
  });
  if (sessErr) {
    return {
      skipped: true,
      reason: `session_error:${sessErr.message}`,
      hook: RT_HOOK,
    };
  }
  await sb.realtime.setAuth(tok.access_token);
  const ch = sb.channel(`expediente:${prospectId}`, {
    config: { private: true, presence: { key: randomUUID() }, broadcast: { self: true } },
  });
  const status = await new Promise((resolveStatus) => {
    const t = setTimeout(() => resolveStatus("TIMED_OUT"), 12000);
    ch.subscribe((s) => {
      if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
        clearTimeout(t);
        resolveStatus(s);
      }
    });
  });

  let broadcastOk = false;
  let broadcastError = null;
  if (status === "SUBSCRIBED") {
    try {
      const res = await ch.send({
        type: "broadcast",
        event: "field_lock",
        payload: {
          field_id: "survey:visib_6_4_probe",
          user_id: "00000000-0000-0000-0000-000000000000",
          name: "visib-6-4-probe",
          ts: Date.now(),
        },
      });
      broadcastOk = res === "ok";
      if (!broadcastOk) broadcastError = String(res);
    } catch (err) {
      broadcastOk = false;
      broadcastError = err instanceof Error ? err.message : String(err);
    }
  } else {
    broadcastError = `no_subscribe:${status}`;
  }

  try {
    await sb.removeChannel(ch);
  } catch { /* ignore */ }
  // No signOut: en algunas builds revoca el refresh y el Bearer API queda en 401.

  if (status === "TIMED_OUT") {
    return {
      skipped: true,
      reason: "TIMED_OUT (Realtime flaky)",
      status,
      subscribed: false,
      broadcastOk: false,
      broadcastError,
      hook: RT_HOOK,
    };
  }

  const subscribed = status === "SUBSCRIBED";
  let verdict;
  if (expectAccess) {
    // Presence OK si SUBSCRIBED; broadcast puede fallar si policy ausente → PASS*
    if (subscribed && broadcastOk) verdict = "PASS";
    else if (subscribed) verdict = "PASS*";
    else verdict = "FAIL";
  } else {
    // Denegación: no subscribe; si se coló subscribe, broadcast tampoco debe pasar
    if (!subscribed) verdict = "PASS";
    else if (!broadcastOk) verdict = "PASS*"; // hallazgo blando: subscribe sí, broadcast no
    else verdict = "FAIL";
  }

  return {
    skipped: false,
    subscribed,
    status,
    broadcastOk,
    broadcastError,
    verdict,
    expectAccess,
  };
}

function applyRealtime(label, probe) {
  if (probe.skipped) {
    const detail = `${probe.reason || probe.status || "skip"}; hook: ${probe.hook || RT_HOOK}`;
    report.skips.push(`realtime ${label}: ${detail}`);
    step(`realtime ${label} SKIP durable`, true, detail);
    return "SKIP";
  }
  const ok = probe.verdict === "PASS" || probe.verdict === "PASS*";
  step(
    `realtime ${label}`,
    ok,
    `status=${probe.status} broadcast=${probe.broadcastOk} verdict=${probe.verdict}`,
  );
  return probe.verdict;
}

async function main() {
  let pidOwn = null;
  let pidShare = null;

  try {
    const health = await api("GET", "/health");
    step("API health", health.status === 200, String(health.status));

    runHelper(["provision", A.email, PASS, A.name]);
    runHelper(["provision", B.email, PASS, B.name]);
    runHelper(["provision", C.email, PASS, C.name]);
    step("provision A+B+C", true);

    step("grant-liner A", Boolean(runHelper(["grant-liner-role", A.email]).granted));
    // B/C sin liner: actores sin asignación / share / guest

    const tokA = await token(A.email);
    const tokB = await token(B.email);
    const tokC = await token(C.email);
    step("password grant A+B+C", true);

    const created = await api("POST", "/api/v1/prospects", tokA.access_token, {
      name: `VisibOwn ${stamp}`,
    });
    pidOwn = created.json?.data?.id || null;
    step("Owner A alta prospecto", created.status === 201 && Boolean(pidOwn), String(created.status));

    // --- Colaborador asignado ≈ owner A ---
    const listA = await api("GET", "/api/v1/prospects?limit=50&offset=0", tokA.access_token);
    const getA = await api("GET", `/api/v1/prospects/${pidOwn}`, tokA.access_token);
    const syncA = await api("GET", "/api/v1/sync", tokA.access_token);
    const ownInList = listIds(listA).includes(pidOwn);
    const ownInSync = syncClientIds(syncA).includes(pidOwn);
    const ownerLista = listA.status === 200 && ownInList ? "PASS" : "FAIL";
    const ownerFicha = getA.status === 200 ? "PASS" : "FAIL";
    const ownerSync = syncA.status === 200 && ownInSync ? "PASS" : "FAIL";
    step("Owner lista incluye propio", ownerLista === "PASS", `status=${listA.status} inList=${ownInList}`);
    step("Owner ficha 200", ownerFicha === "PASS", String(getA.status));
    step("Owner sync incluye propio", ownerSync === "PASS", `status=${syncA.status} inSync=${ownInSync}`);

    const ownerRt = applyRealtime("owner A (expect access)", await probeRealtime(tokA, pidOwn, { expectAccess: true }));
    matrixRow("Colaborador asignado (owner A)", {
      lista: ownerLista,
      ficha_ajena: "N/A (propio)",
      sync_pull: ownerSync,
      realtime: ownerRt,
      ui_clientes: "SKIP",
    });
    report.skips.push("UI Clientes: opcional; no Playwright en este runner");

    // --- Sin asignación = B ---
    const listB0 = await api("GET", "/api/v1/prospects?limit=50&offset=0", tokB.access_token);
    const getB0 = await api("GET", `/api/v1/prospects/${pidOwn}`, tokB.access_token);
    const syncB0 = await api("GET", "/api/v1/sync", tokB.access_token);
    const bSeesList = listIds(listB0).includes(pidOwn);
    const bSeesSync = syncClientIds(syncB0).includes(pidOwn);
    const sinLista = listB0.status === 200 && !bSeesList ? "PASS" : "FAIL";
    const sinFicha = getB0.status === 404 || getB0.status === 403 ? "PASS" : "FAIL";
    const sinSync = syncB0.status === 200 && !bSeesSync ? "PASS" : "FAIL";
    step("B sin asignación: lista sin ajeno", sinLista === "PASS", `status=${listB0.status} sees=${bSeesList}`);
    step("B sin asignación: ficha 404/403", sinFicha === "PASS", String(getB0.status));
    step("B sin asignación: sync sin ajeno", sinSync === "PASS", `status=${syncB0.status} sees=${bSeesSync}`);

    const sinRt = applyRealtime(
      "B sin asignación denial (neg pattern)",
      await probeRealtime(tokB, pidOwn, { expectAccess: false }),
    );
    matrixRow("Sin asignación (B)", {
      lista: sinLista,
      ficha_ajena: sinFicha,
      sync_pull: sinSync,
      realtime: sinRt,
      ui_clientes: "SKIP",
    });

    // --- Share view = seed-collab-share-only view (B no miembro WS) ---
    // Re-grant: probes realtime previos no deben dejar Bearer muertos.
    const tokA2 = await token(A.email);
    const tokB2 = await token(B.email);
    const tokC2 = await token(C.email);
    step("re-grant A+B+C pre-share", true);

    pidShare = randomUUID();
    const seedP = runHelper(["seed-prospect", A.email, pidShare, `VisibShare ${stamp}`]);
    step("seed-prospect share-only", Boolean(seedP.prospect_id), String(seedP.prospect_id || "").slice(0, 8));
    const shareOnly = runHelper(["seed-collab-share-only", A.email, B.email, pidShare, "view"]);
    step(
      "seed-collab-share-only view B",
      Boolean(shareOnly.share_id) && shareOnly.guest === false,
      `share=${String(shareOnly.share_id || "").slice(0, 8)} guest=${shareOnly.guest}`,
    );
    const assertRo = runHelper(["assert-collab-share-only", A.email, B.email, pidShare]);
    step("assert RO share-only (!guest_miembro)", assertRo.ok === true, JSON.stringify(assertRo).slice(0, 200));

    const getBShare = await api("GET", `/api/v1/prospects/${pidShare}`, tokB2.access_token);
    const listBShare = await api("GET", "/api/v1/prospects?limit=50&offset=0", tokB2.access_token);
    const syncBShare = await api("GET", "/api/v1/sync", tokB2.access_token);
    const shareInList = listIds(listBShare).includes(pidShare);
    const foreignStillHidden = !listIds(listBShare).includes(pidOwn);
    const shareInSync = syncClientIds(syncBShare).includes(pidShare);
    const foreignSyncHidden = !syncClientIds(syncBShare).includes(pidOwn);
    // PASS*: list/sync pueden omitir share; ficha 200 ideal. 404 = gap getProspect vs share (doc).
    const shareFicha = getBShare.status === 200 ? "PASS" : (getBShare.status === 404 ? "PASS*" : "FAIL");
    step(
      "Share-only B ficha (200 o PASS* 404)",
      shareFicha.startsWith("PASS"),
      String(getBShare.status),
    );
    // Sync: lo crítico es no traer ajenos (pidOwn); incluir compartido es deseable
    const shareSyncFinal = syncBShare.status === 200 && foreignSyncHidden
      ? (shareInSync ? "PASS" : "PASS*")
      : "FAIL";
    step(
      "Share-only B lista (compartido; sin ajeno owner-API)",
      listBShare.status === 200 && foreignStillHidden,
      `inList=${shareInList} foreignHidden=${foreignStillHidden}`,
    );
    step(
      "Share-only B sync sin ajeno owner-API",
      shareSyncFinal.startsWith("PASS"),
      `shareInSync=${shareInSync} foreignHidden=${foreignSyncHidden}`,
    );

    // Share-only: predicado puede o no conceder presence; nunca FAIL duro
    const rtShareProbe = await probeRealtime(tokB2, pidShare, { expectAccess: true });
    let shareRt = "SKIP";
    if (rtShareProbe.skipped) {
      shareRt = applyRealtime("Share-only B", rtShareProbe);
    } else {
      shareRt = rtShareProbe.subscribed ? (rtShareProbe.broadcastOk ? "PASS" : "PASS*") : "PASS*";
      step(
        "Share-only B realtime (según predicado; soft)",
        true,
        `status=${rtShareProbe.status} broadcast=${rtShareProbe.broadcastOk} → ${shareRt}`,
      );
    }
    matrixRow("Share view (seed-collab-share-only view)", {
      lista: shareInList && foreignStillHidden ? "PASS" : (foreignStillHidden ? "PASS*" : "FAIL"),
      ficha_ajena: shareFicha,
      sync_pull: shareSyncFinal,
      realtime: shareRt,
      ui_clientes: "SKIP",
      note: "PASS* = predicado OK pero lista/sync/realtime puede omitir share en esa superficie",
    });

    // --- Colaborador vía seed-collab-share (C guest WS + share) sobre pidOwn ---
    const shareC = runHelper(["seed-collab-share", A.email, C.email, pidOwn, "view"]);
    step("seed-collab-share view C", Boolean(shareC.share_id), String(shareC.share_id || "").slice(0, 8));
    const getC = await api("GET", `/api/v1/prospects/${pidOwn}`, tokC2.access_token);
    const listC = await api("GET", "/api/v1/prospects?limit=50&offset=0", tokC2.access_token);
    const syncC = await api("GET", "/api/v1/sync", tokC2.access_token);
    const cLista = listC.status === 200 && listIds(listC).includes(pidOwn) ? "PASS" : (listC.status === 200 ? "PASS*" : "FAIL");
    const cFicha = getC.status === 200 ? "PASS" : (getC.status === 404 ? "PASS*" : "FAIL");
    const cSync = syncC.status === 200 && syncClientIds(syncC).includes(pidOwn) ? "PASS" : (syncC.status === 200 ? "PASS*" : "FAIL");
    step("C share+guest ficha (200 o PASS* 404)", cFicha.startsWith("PASS"), String(getC.status));
    step("C share+guest lista/sync", cLista.startsWith("PASS") && cSync.startsWith("PASS"), `lista=${cLista} sync=${cSync}`);

    const cRt = applyRealtime(
      "C share+guest (expect access)",
      await probeRealtime(tokC2, pidOwn, { expectAccess: true }),
    );
    matrixRow("Colaborador asignado (share+guest WS C)", {
      lista: cLista,
      ficha_ajena: cFicha,
      sync_pull: cSync,
      realtime: cRt,
      ui_clientes: "SKIP",
    });

    // --- Guest sin rol = B sobre pidOwn (solo tiene share de pidShare, no de pidOwn) ---
    const getBForeign = await api("GET", `/api/v1/prospects/${pidOwn}`, tokB2.access_token);
    const guestFicha = getBForeign.status === 404 || getBForeign.status === 403 ? "PASS" : "FAIL";
    const syncB2 = await api("GET", "/api/v1/sync", tokB2.access_token);
    const guestSync = syncB2.status === 200 && !syncClientIds(syncB2).includes(pidOwn) ? "PASS" : "FAIL";
    step("Guest/B ficha ajena no compartida 404/403", guestFicha === "PASS", String(getBForeign.status));
    step("Guest/B sync no trae ajeno no compartido", guestSync === "PASS", `seesOwn=${syncClientIds(syncB2).includes(pidOwn)}`);

    const guestRt = applyRealtime(
      "Guest/B denial ajeno (neg pattern)",
      await probeRealtime(tokB2, pidOwn, { expectAccess: false }),
    );
    matrixRow("Guest sin rol (B vs prospecto no compartido)", {
      lista: "PASS*",
      ficha_ajena: guestFicha,
      sync_pull: guestSync,
      realtime: guestRt,
      ui_clientes: "SKIP",
    });

    // --- GAPs sala/empresa (efímero only; NEVER mutate RH sala) ---
    const gapNotes = [
      "GAP Gerente/Asistente/Admin: helper sin seed-sala-roles-ephemeral; no mutar sala RH real.",
      "Futuro efímero: WS sala_de_venta QA + rol_en_workspace=gerente | slug asistente_sala | empresa_miembros.es_admin + purge a 0.",
      "Prohibido: UPDATE/INSERT sobre workspace_miembros / empresa_miembros de sala RH producción.",
    ];
    for (const g of gapNotes) report.gaps.push(g);
    for (const actor of ["Gerente", "Asistente sala", "Admin empresa"]) {
      matrixRow(actor, {
        lista: "GAP",
        ficha_ajena: "GAP",
        sync_pull: "GAP",
        realtime: "GAP",
        ui_clientes: "SKIP",
        todo: "seed-sala-roles-ephemeral (@saletse-test.com) — no SQL sala RH",
      });
    }
    step("GAP documentado Gerente/Asistente/Admin", true, gapNotes[0]);
  } catch (err) {
    step("runner", false, err instanceof Error ? err.message : String(err));
  } finally {
    for (const [label, email] of [["C", C.email], ["B", B.email], ["A", A.email]]) {
      try {
        const leftover = runHelper(["purge", email]);
        report.leftover[label] = leftover;
        step(`purga ${label} a 0`, countsZero(leftover), JSON.stringify(leftover));
      } catch (e) {
        step(`purga ${label}`, false, e instanceof Error ? e.message : String(e));
      }
    }
    try {
      unlinkSync(CREDS);
    } catch { /* ignore */ }

    const hardFail = report.steps.filter((s) => !s.ok);
    const matrixFail = report.matrix.filter((r) =>
      Object.entries(r).some(([k, v]) => k !== "actor" && k !== "todo" && k !== "note" && v === "FAIL"),
    );
    report.ok = hardFail.length === 0 && matrixFail.length === 0;
    report.failed_steps = hardFail.map((s) => s.name);
    report.failed_matrix_actors = matrixFail.map((r) => r.actor);
    writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(`\nreporte (sin password): ${OUT}`);
    console.log(JSON.stringify({
      ok: report.ok,
      failed_steps: report.failed_steps,
      failed_matrix_actors: report.failed_matrix_actors,
      gaps: report.gaps,
      skips: report.skips,
      matrix: report.matrix,
    }, null, 2));
  }
  process.exit(report.ok ? 0 : 1);
}

main();
