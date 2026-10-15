/**
 * Pruebas NEGATIVAS de autorización Realtime broadcast en canales expediente:{uuid}.
 *
 * Solo cuentas QA efímeras (@saletse-test.com). Sin sala/empresa real.
 * Contraseñas: randomBytes → %TEMP% (nunca repo). Auth vía password grant (sin UI).
 *
 * Casos:
 *  C sin ownership/share → subscribe y broadcast en expediente de A → RECHAZADO
 *  B con share de P1 (+ guest WS vía seed-collab-share) → subscribe/broadcast en P2
 *    → idealmente RECHAZADO; hoy user_can_access_prospect concede acceso a todo
 *    prospect del WS si user_in_workspace (guest), así que B en P2 puede pasar
 *    SUBSCRIBED — documentar / tratar como hallazgo de modelo de acceso, no solo 0090
 *  B → broadcast en P1 (compartido) → ACEPTADO solo si existe broadcast_expediente
 *
 * Exit 2 = falla de seguridad (subscribe/broadcast aceptado donde debía rechazarse).
 *
 * Uso:
 *   node scripts/architecture/smoke-realtime-broadcast-negative-qa.mjs
 *
 * Env: SUPABASE_URL / VITE_SUPABASE_URL, SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY
 *      (overlay VPS en %TEMP% o .env.local)
 */
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "../..");
const HELPER = resolve(__dir, "qa-geo-fx-ephemeral.py");
const stamp = Date.now().toString(36);
const EMAIL_A = `qa-rt-neg-a-${stamp}@saletse-test.com`;
const EMAIL_B = `qa-rt-neg-b-${stamp}@saletse-test.com`;
const EMAIL_C = `qa-rt-neg-c-${stamp}@saletse-test.com`;
const PASS = randomBytes(18).toString("base64url");
const CREDS = resolve(tmpdir(), `saletse-qa-rt-neg-${stamp}.creds.json`);

const EXIT_OK = 0;
const EXIT_TEST_FAIL = 1;
const EXIT_SECURITY_FAIL = 2;

writeFileSync(
  CREDS,
  JSON.stringify(
    { a: EMAIL_A, b: EMAIL_B, c: EMAIL_C, created_at: new Date().toISOString() },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(`Credenciales fuera del repo: ${CREDS}`);

const report = { steps: [], securityFail: false, leftover: {} };

function step(name, ok, detail = "", { security = false } = {}) {
  report.steps.push({ name, ok, detail, security });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok && security) report.securityFail = true;
}

function runHelper(args) {
  const r = spawnSync("python", [HELPER, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 180000,
  });
  if (r.status !== 0) {
    throw new Error(`helper ${args[0]}: ${(r.stderr || r.stdout || "").slice(0, 800)}`);
  }
  const line = (r.stdout || "").trim().split(/\r?\n/).filter(Boolean).pop();
  return line ? JSON.parse(line) : {};
}

function loadSupabaseEnv() {
  const overlay = resolve(tmpdir(), "saletse-vps-auth-overlay.env");
  const files = [overlay, resolve(root, ".env.local"), resolve(root, ".env")];
  const env = { ...process.env };
  for (const f of files) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!(k in env) || !env[k]) env[k] = v;
    }
  }
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Falta SUPABASE_URL/ANON_KEY (overlay o .env.local)");
  return { url, anon };
}

function purgeZero(c) {
  return (
    c.profiles === 0
    && c.prospects === 0
    && c.shares === 0
    && c.connections === 0
    && c.ws_personal === 0
    && c.workspace_miembros === 0
    && c.tool_calculations === 0
    && c.empresa_miembros === 0
  );
}

async function passwordGrant(supabaseUrl, anonKey, email, password) {
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(`password grant ${email}: ${res.status} ${body.error_description || body.msg || body.error || ""}`);
  }
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token || "",
  };
}

async function probeExpedienteChannel(supabaseUrl, anonKey, tokens, prospectId) {
  const sb = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: sessErr } = await sb.auth.setSession({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || tokens.access_token,
  });
  if (sessErr) {
    return {
      subscribed: false,
      subscribeStatus: `session_error:${sessErr.message}`,
      broadcastOk: false,
      broadcastError: sessErr.message,
    };
  }
  await sb.realtime.setAuth(tokens.access_token);

  const topic = `expediente:${prospectId}`;
  const ch = sb.channel(topic, {
    config: {
      private: true,
      presence: { key: randomUUID() },
      broadcast: { self: true },
    },
  });

  const subscribeStatus = await new Promise((resolve) => {
    const t = setTimeout(() => resolve("TIMED_OUT"), 12000);
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(t);
        resolve(status);
      }
    });
  });

  const subscribed = subscribeStatus === "SUBSCRIBED";
  let broadcastOk = false;
  let broadcastError = null;

  if (subscribed) {
    try {
      const res = await ch.send({
        type: "broadcast",
        event: "field_lock",
        payload: {
          field_id: "survey:neg_probe",
          user_id: "00000000-0000-0000-0000-000000000000",
          name: "neg-probe",
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
    broadcastError = `no_subscribe:${subscribeStatus}`;
  }

  try {
    await sb.removeChannel(ch);
  } catch {
    /* ignore */
  }
  try {
    await sb.auth.signOut({ scope: "local" });
  } catch {
    /* ignore */
  }

  return { subscribed, subscribeStatus, broadcastOk, broadcastError };
}

async function main() {
  const { url: supabaseUrl, anon: anonKey } = loadSupabaseEnv();

  try {
    runHelper(["provision", EMAIL_A, PASS, `QA RtNeg A ${stamp}`]);
    runHelper(["provision", EMAIL_B, PASS, `QA RtNeg B ${stamp}`]);
    runHelper(["provision", EMAIL_C, PASS, `QA RtNeg C ${stamp}`]);
    step("provision A+B+C", true);

    const pidShared = randomUUID();
    const pidOther = randomUUID();
    runHelper(["seed-prospect", EMAIL_A, pidShared, "RtNegShared"]);
    runHelper(["seed-prospect", EMAIL_A, pidOther, "RtNegOther"]);
    const share = runHelper(["seed-collab-share", EMAIL_A, EMAIL_B, pidShared, "edit"]);
    step(
      "seed P1 share B + P2 sin share",
      Boolean(share.share_id),
      `P1=${pidShared.slice(0, 8)} P2=${pidOther.slice(0, 8)}`,
    );

    const tokA = await passwordGrant(supabaseUrl, anonKey, EMAIL_A, PASS);
    const tokB = await passwordGrant(supabaseUrl, anonKey, EMAIL_B, PASS);
    const tokC = await passwordGrant(supabaseUrl, anonKey, EMAIL_C, PASS);
    step("password grant A+B+C", true);

    const cOnP1 = await probeExpedienteChannel(supabaseUrl, anonKey, tokC, pidShared);
    step(
      "NEG C subscribe P1 (sin share)",
      !cOnP1.subscribed,
      `status=${cOnP1.subscribeStatus}`,
      { security: cOnP1.subscribed },
    );
    step(
      "NEG C broadcast P1 (sin share)",
      !cOnP1.broadcastOk,
      cOnP1.broadcastError || "denied",
      { security: cOnP1.broadcastOk },
    );

    const bOnP2 = await probeExpedienteChannel(supabaseUrl, anonKey, tokB, pidOther);
    step(
      "NEG B subscribe P2 (no compartido)",
      !bOnP2.subscribed,
      `status=${bOnP2.subscribeStatus}`,
      { security: bOnP2.subscribed },
    );
    step(
      "NEG B broadcast P2 (no compartido)",
      !bOnP2.broadcastOk,
      bOnP2.broadcastError || "denied",
      { security: bOnP2.broadcastOk },
    );

    const bOnP1 = await probeExpedienteChannel(supabaseUrl, anonKey, tokB, pidShared);
    step(
      "POS B subscribe P1 (compartido)",
      bOnP1.subscribed,
      `status=${bOnP1.subscribeStatus}`,
    );
    step(
      "POS B broadcast P1 (compartido)",
      bOnP1.broadcastOk,
      bOnP1.broadcastOk ? "ok" : (bOnP1.broadcastError || "fail"),
    );

    const aOnP1 = await probeExpedienteChannel(supabaseUrl, anonKey, tokA, pidShared);
    step(
      "POS A broadcast P1 (owner)",
      aOnP1.subscribed && aOnP1.broadcastOk,
      aOnP1.broadcastOk ? "ok" : `${aOnP1.subscribeStatus}/${aOnP1.broadcastError}`,
    );
  } catch (err) {
    step("runner", false, err instanceof Error ? err.message : String(err));
  } finally {
    try {
      report.leftover = {
        C: runHelper(["purge", EMAIL_C]),
        B: runHelper(["purge", EMAIL_B]),
        A: runHelper(["purge", EMAIL_A]),
      };
      const ok =
        purgeZero(report.leftover.C)
        && purgeZero(report.leftover.B)
        && purgeZero(report.leftover.A);
      step("purga A+B+C conteos 0", ok, JSON.stringify(report.leftover));
    } catch (err) {
      step("purga", false, err instanceof Error ? err.message : String(err));
    }
    try {
      unlinkSync(CREDS);
    } catch {
      /* ignore */
    }
  }

  console.log("\n=== RESUMEN NEGATIVE BROADCAST ===");
  console.log(JSON.stringify(report, null, 2));

  if (report.securityFail) {
    console.error(
      "\nSECURITY FAIL: se aceptó subscribe/broadcast donde debía rechazarse.\n"
        + "Ejecutar: python %USERPROFILE%\\.saletse-ops\\rollback-broadcast-expediente-0090.py --execute\n",
    );
    process.exit(EXIT_SECURITY_FAIL);
  }
  const failed = report.steps.some((s) => !s.ok);
  process.exit(failed ? EXIT_TEST_FAIL : EXIT_OK);
}

main();
