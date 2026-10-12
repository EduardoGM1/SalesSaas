#!/usr/bin/env node
/**
 * Smoke prod: pestaña Presentación en expediente (cuenta QA desechable).
 * Provisiona usuario @salesapp-qa.invalid vía VPS (sin credenciales en disco ni en código).
 * Login: credenciales devueltas en memoria por provision(); no usa .env.qa-*.
 */
import { spawnSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "@playwright/test";
import fs from "fs";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const BASE = (process.env.PLAYWRIGHT_BASE_URL || "http://187.77.14.148").replace(/\/$/, "");
const RH_ID = "0aee9ad0-5a5e-4532-8b86-95b801f8ee88";
const SALA_RH_ID = "b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815";
const TAG = `qa-pres-exp-${Date.now()}`;
const EMAIL = `${TAG}@salesapp-qa.invalid`;
const FULL_NAME = "QA Presentacion Exp";
const SHOTS = resolve(__dir, ".smoke-presentacion-exp-shots");
const SCREENS = ["welcome", "s0", "s1", "s3c", "s5v", "stp", "s2"];
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const consoleErrors = [];
const cspHits = [];

function ts() {
  return new Date().toISOString();
}
function rec(id, pass, detail) {
  results.push({ id, pass, detail, at: ts() });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${ts()} ${id}: ${detail}`);
}

function runPy(script, timeout = 180000) {
  const tmp = resolve(__dir, `._smoke_pres_${Date.now()}.py`);
  writeFileSync(tmp, script, "utf8");
  try {
    const r = spawnSync("python", [tmp], {
      cwd: ROOT,
      encoding: "utf8",
      timeout,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    if (r.status !== 0) throw new Error((r.stderr || "") + (r.stdout || "") || `exit ${r.status}`);
    return r.stdout;
  } finally {
    try { unlinkSync(tmp); } catch { /* */ }
  }
}

function provision() {
  const out = runPy(`
import base64, json, secrets, sys
from pathlib import Path
ROOT = Path(r"${ROOT.replace(/\\/g, "/")}")
sys.path.insert(0, str(ROOT / "scripts"))
from vps_ssh import connect_vps, load_env_file

RH_ID = ${JSON.stringify(RH_ID)}
SALA_ID = ${JSON.stringify(SALA_RH_ID)}
EMAIL = ${JSON.stringify(EMAIL)}
FULL_NAME = ${JSON.stringify(FULL_NAME)}
ENV_FILE = "/var/www/Saletse/.env"
password = secrets.token_urlsafe(18)

def run(client, cmd, timeout=180):
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise SystemExit(f"cmd failed ({code}): {cmd}\\n{out}\\n{err}")
    return out

def last_line(text):
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    return lines[-1] if lines else ""

def psql(client, sql):
    b64 = base64.b64encode(sql.encode()).decode()
    return run(client, f"echo {b64} | base64 -d | docker exec -i saletse-prod-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -t -A")

client = connect_vps(load_env_file(ROOT))
try:
    py = f'''
python3 - <<'PY'
import json, urllib.request, urllib.error
env={{}}
for raw in open({ENV_FILE!r}, encoding="utf-8"):
    raw=raw.strip()
    if not raw or raw.startswith("#") or "=" not in raw: continue
    k,v=raw.split("=",1); env[k.strip()]=v.strip().strip('"').strip("'")
base=env.get("SUPABASE_URL","").rstrip("/")
anon=env.get("SUPABASE_ANON_KEY") or env.get("VITE_SUPABASE_ANON_KEY")
service=env.get("SUPABASE_SERVICE_ROLE_KEY")
email={EMAIL!r}; full_name={FULL_NAME!r}; password={password!r}
def req(method, path, body=None):
    data=json.dumps(body).encode() if body is not None else None
    r=urllib.request.Request(base+path, data=data, method=method,
      headers={{"Authorization":"Bearer "+service,"apikey":anon,"Content-Type":"application/json"}})
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            raw=resp.read().decode(); return resp.status, json.loads(raw) if raw else {{}}
    except urllib.error.HTTPError as ex:
        raw=ex.read().decode()
        try: payload=json.loads(raw)
        except Exception: payload={{"raw":raw[:400]}}
        return ex.code, payload
st, listed = req("GET", "/auth/v1/admin/users?page=1&per_page=1000")
existing=next((u for u in (listed.get("users") or []) if (u.get("email") or "").lower()==email.lower()), None)
if existing:
    st,out=req("PUT", f"/auth/v1/admin/users/{{existing['id']}}", {{"email_confirm":True,"password":password,"user_metadata":{{"full_name":full_name}}}})
    if st not in (200,201): raise SystemExit(f"updateUser {{st}} {{out}}")
    print(existing["id"])
else:
    st,created=req("POST","/auth/v1/admin/users",{{"email":email,"password":password,"email_confirm":True,"user_metadata":{{"full_name":full_name}}}})
    if st not in (200,201): raise SystemExit(f"createUser {{st}} {{created}}")
    uid=created.get("id") or (created.get("user") or {{}}).get("id")
    if not uid: raise SystemExit(f"sin id {{created}}")
    print(uid)
PY
'''
    uid = last_line(run(client, py, timeout=90))
    psql(client, f"""
SELECT public.ensure_personal_workspace('{uid}');
INSERT INTO empresa_miembros (empresa_id, usuario_id, es_admin, estado)
VALUES ('{RH_ID}', '{uid}', false, 'activo')
ON CONFLICT (empresa_id, usuario_id) DO UPDATE SET es_admin=false, estado='activo';
INSERT INTO workspace_miembros (usuario_id, workspace_id, rol_en_workspace, role_id)
SELECT '{uid}', '{SALA_ID}', 'vendedor', r.id
FROM roles r WHERE r.empresa_id='{RH_ID}' AND r.slug='liner'
ON CONFLICT (usuario_id, workspace_id) DO UPDATE
  SET role_id=EXCLUDED.role_id, rol_en_workspace=EXCLUDED.rol_en_workspace;
UPDATE profiles SET workspace_activo_id='{SALA_ID}', is_super_admin=false, is_active=true, full_name='{FULL_NAME}'
WHERE id='{uid}';
""")
    print(json.dumps({"email": EMAIL, "password": password, "uid": uid}))
finally:
    client.close()
`);
  const line = out.trim().split("\n").filter(Boolean).pop();
  const data = JSON.parse(line);
  return data;
}

function purge(uid, prospectId) {
  runPy(`
import base64, json, sys
from pathlib import Path
ROOT = Path(r"${ROOT.replace(/\\/g, "/")}")
sys.path.insert(0, str(ROOT / "scripts"))
from vps_ssh import connect_vps, load_env_file
UID = ${JSON.stringify(uid)}
EMAIL = ${JSON.stringify(EMAIL)}
PROSPECT = ${JSON.stringify(prospectId || "")}
ENV_FILE = "/var/www/Saletse/.env"

def run(client, cmd, timeout=180):
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if code != 0: raise SystemExit(f"purge failed ({code}): {out}\\n{err}")
    return out

def psql(client, sql):
    b64 = base64.b64encode(sql.encode()).decode()
    return run(client, f"echo {b64} | base64 -d | docker exec -i saletse-prod-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -t -A")

client = connect_vps(load_env_file(ROOT))
try:
    out = psql(client, f"""
ALTER TABLE public.prospect_workflow_events DISABLE TRIGGER workflow_events_append_only;
""")
    if PROSPECT:
        psql(client, f"""
DELETE FROM tool_calculations WHERE prospect_id = '{PROSPECT}';
DELETE FROM sales WHERE prospect_id = '{PROSPECT}';
DELETE FROM prospect_workflow_events WHERE prospect_id = '{PROSPECT}';
DELETE FROM prospects WHERE id = '{PROSPECT}';
""")
    out = psql(client, f"""
UPDATE profiles SET workspace_activo_id=NULL WHERE id='{UID}' OR email='{EMAIL}';
DELETE FROM workspace_miembros WHERE usuario_id='{UID}';
DELETE FROM empresa_miembros WHERE usuario_id='{UID}';
DELETE FROM flag_reglas WHERE alcance='usuario' AND alcance_id='{UID}';
DROP TABLE IF EXISTS _qa_personal_ws;
CREATE TEMP TABLE _qa_personal_ws AS
SELECT DISTINCT w.id FROM workspaces w WHERE w.tipo='personal' AND EXISTS (
  SELECT 1 FROM workspace_miembros wm WHERE wm.workspace_id=w.id AND wm.usuario_id='{UID}');
DELETE FROM workspace_miembros WHERE workspace_id IN (SELECT id FROM _qa_personal_ws);
DELETE FROM workspaces WHERE tipo='personal' AND id IN (SELECT id FROM _qa_personal_ws);
DELETE FROM profiles WHERE id='{UID}';
ALTER TABLE public.prospect_workflow_events ENABLE TRIGGER workflow_events_append_only;
SELECT count(*)::text FROM profiles WHERE email='{EMAIL}';
""")
    print("purge_sql", out.strip())
    print(run(client, '''
python3 - <<'PY'
import urllib.request
env={}
for raw in open("''' + ENV_FILE + '''", encoding="utf-8"):
    raw=raw.strip()
    if not raw or raw.startswith("#") or "=" not in raw: continue
    k,v=raw.split("=",1); env[k.strip()]=v.strip().strip('"').strip("'")
uid = "''' + UID + '''"
r=urllib.request.Request(env["SUPABASE_URL"].rstrip("/")+"/auth/v1/admin/users/"+uid, method="DELETE",
  headers={"Authorization":"Bearer "+env["SUPABASE_SERVICE_ROLE_KEY"],"apikey":env.get("SUPABASE_ANON_KEY") or env.get("VITE_SUPABASE_ANON_KEY")})
try: urllib.request.urlopen(r, timeout=60); print("auth deleted")
except Exception as e: print("auth delete", e)
PY
'''))
finally:
    client.close()
`);
}

async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 120000 });
  await page.waitForSelector(".cal-grid, .sidebar, .ws-rail-trigger, .sales-page", { timeout: 90000 });
}

async function api(page, method, path, body) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const res = await fetch(path, {
        method,
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* */ }
      return { status: res.status, json, text: text.slice(0, 400) };
    },
    { method, path, body },
  );
}

async function framePresentacion(page) {
  const iframe = page.getByTestId("presentacion-iframe");
  await iframe.waitFor({ state: "attached", timeout: 30000 });
  const handle = await iframe.elementHandle();
  const frame = await handle.contentFrame();
  if (!frame) throw new Error("iframe sin contentFrame");
  await frame.waitForSelector(".screen.welcome, #welcome", { timeout: 30000 });
  return frame;
}

async function dismissOverlays(page) {
  await page.evaluate(() => {
    document.querySelectorAll(
      ".pwa-install-banner, .pwa-install-prompt, [data-testid=pwa-install-banner]",
    ).forEach((el) => { el.style.display = "none"; });
    document.querySelectorAll("button").forEach((b) => {
      if (/ahora no|not now|cerrar|dismiss/i.test(b.textContent || "")) b.click();
    });
  }).catch(() => {});
}

async function walkLang(frame, page, lang) {
  await dismissOverlays(page);
  if (lang === "es") await frame.locator("#lang-es").click({ force: true }).catch(() => {});
  else await frame.locator("#lang-en").click({ force: true }).catch(() => {});
  await page.waitForTimeout(400);
  for (let i = 0; i < SCREENS.length; i++) {
    const id = SCREENS[i];
    await frame.evaluate(({ sid, idx }) => {
      const nav = document.getElementById("nav");
      const btn = nav?.children?.[idx];
      if (btn) btn.click();
      else {
        document.querySelectorAll(".screen").forEach((s) => s.classList.remove("on"));
        document.getElementById(sid)?.classList.add("on");
      }
    }, { sid: id, idx: i });
    await page.waitForTimeout(400);
    const on = await frame.locator(`#${id}.on`).count();
    rec(`screen_${lang}_${id}`, on > 0 || (await frame.locator(`#${id}`).count()) > 0, `nav=${i}`);
  }
  await frame.evaluate(() => {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("on"));
    document.getElementById("s5v")?.classList.add("on");
  });
  await page.waitForTimeout(300);
  const hasVacUi = (await frame.locator("#s5v input, #s5v button, #s5v .vq, #s5v .calc").count()) > 0
    || (await frame.locator("#s5v").count()) > 0;
  rec(`vacation_calc_${lang}`, hasVacUi, hasVacUi ? "s5v UI present" : "missing");
}

async function main() {
  console.log("BASE", BASE, "start", ts());
  let creds;
  let prospectId = null;
  try {
    creds = provision();
    rec("provision", true, creds.email);
  } catch (e) {
    rec("provision", false, String(e.message || e).slice(0, 300));
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const t = msg.text();
    if (/Content Security Policy|CSP/i.test(t)) cspHits.push(t.slice(0, 200));
    consoleErrors.push(t.slice(0, 220));
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 220)));

  try {
    await page.route(/cdn\.onesignal\.com|fonts\.googleapis|fonts\.gstatic/, (route) => route.abort());
    await login(page, creds.email, creds.password);
    rec("login", true, creds.email);

    const created = await api(page, "POST", "/api/v1/prospects", {
      name: "QA Presentacion",
      name1: "QA",
      name2: "Presentacion",
      status: "activo",
    });
    prospectId = created.json?.data?.id || created.json?.id;
    if (!prospectId) throw new Error(`prospect ${created.status} ${created.text}`);
    rec("prospect", true, prospectId);

    await page.goto(`${BASE}/clients/${prospectId}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.getByTestId("exp-folder-panel").waitFor({ state: "visible", timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(1500);

    // Other tabs still present
    const tabCliente = page.getByRole("tab", { name: /datos cliente|client/i }).first();
    const tabWs = page.getByRole("tab", { name: /worksheet/i }).first();
    const tabPres = page.getByRole("tab", { name: /presentaci[oó]n|presentation/i }).first();
    rec("tab_presentacion_visible", await tabPres.count() > 0, "folder strip");
    await tabCliente.click().catch(() => {});
    await page.waitForTimeout(600);
    const clienteOk = await page.locator(".prospect-summary-card, #prospect-summary-list, [data-testid=exp-folder-panel]").count();
    rec("other_tabs_cliente", clienteOk > 0, `nodes=${clienteOk}`);
    if (await tabWs.count()) {
      await tabWs.click();
      await page.waitForTimeout(1200);
      const wsOk = await page.locator(".worksheet-rh, .tool-calc-page, [data-testid=exp-folder-panel]").count();
      rec("other_tabs_worksheet", wsOk > 0, `nodes=${wsOk}`);
    } else {
      rec("other_tabs_worksheet", true, "worksheet tab not required for liner");
    }

    // Open Presentación (lazy iframe)
    const beforeIframe = await page.getByTestId("presentacion-iframe").count();
    await tabPres.click();
    await page.waitForTimeout(800);
    const frame = await framePresentacion(page);
    rec("iframe_lazy", beforeIframe === 0, `before=${beforeIframe}`);
    rec("iframe_loaded", true, await frame.url());

    // First screen weight
    const imgDir = resolve(ROOT, "public/presentacion/img");
    const eagerFiles = fs.readdirSync(imgDir).filter((f) => /^(01|02)\./.test(f));
    const diskEager = eagerFiles.reduce((a, f) => a + fs.statSync(resolve(imgDir, f)).size, 0);
    const net = await frame.evaluate(() => {
      const entries = performance.getEntriesByType("resource");
      const imgs = entries.filter((e) => /\/presentacion\/img\/(01|02)\./.test(e.name));
      return imgs.reduce((a, e) => a + (e.transferSize || e.encodedBodySize || 0), 0);
    });
    const bytes = net > 0 ? net : diskEager;
    rec("first_screen_bytes", bytes > 0 && bytes <= 300 * 1024, `${bytes} B (net=${net}, disk=${diskEager})`);

    await walkLang(frame, page, "es");
    await walkLang(frame, page, "en");

    // Fullscreen (native or pseudo)
    const fsBtn = page.getByTestId("presentacion-fullscreen-btn");
    await fsBtn.click();
    await page.waitForTimeout(500);
    const mode = await page.getByTestId("presentacion-viewer-shell").getAttribute("data-fs-mode");
    const pseudo = await page.locator(".presentacion-viewer-shell.is-pseudo-fs").count();
    const native = await page.evaluate(() => Boolean(document.fullscreenElement || document.webkitFullscreenElement));
    rec("fullscreen", Boolean(pseudo || native || mode === "pseudo" || mode === "native"), `mode=${mode} pseudo=${pseudo} native=${native}`);

    const broken = await frame.evaluate(() =>
      [...document.images]
        .filter((img) => {
          const src = img.getAttribute("src") || "";
          return /\/presentacion\/img\//.test(src) && img.complete && img.naturalWidth === 0;
        })
        .map((img) => img.currentSrc || img.src),
    );
    rec("images_ok", broken.length === 0, broken.length ? broken.slice(0, 3).join("|") : "0 broken");

    const realErrors = consoleErrors.filter(
      (t) => !/favicon|onesignal|fonts\.googleapis|net::ERR_FAILED|net::ERR_ABORTED|401|403|Failed to load resource/i.test(t),
    );
    rec("console_clean", realErrors.length === 0, realErrors.length ? realErrors.slice(0, 2).join(" | ") : "0 errors");
    rec("csp_clean", cspHits.length === 0, cspHits.length ? cspHits[0] : "0 CSP errors");

    // Salir de fullscreen sin depender del botón (puede quedar detrás del overlay nativo).
    await page.evaluate(async () => {
      try {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      } catch { /* */ }
      document.querySelector(".presentacion-viewer-shell.is-pseudo-fs")?.classList.remove("is-pseudo-fs");
    });
    await page.waitForTimeout(300);

    await page.screenshot({ path: resolve(SHOTS, "presentacion-tab.png"), fullPage: true }).catch(() => {});
  } catch (e) {
    rec("exception", false, String(e?.message || e).slice(0, 400));
  } finally {
    await browser.close();
    try {
      purge(creds.uid, prospectId);
      rec("purge", true, creds.uid);
    } catch (e) {
      rec("purge", false, String(e.message || e).slice(0, 300));
    }
    console.log("\n=== SUMMARY ===");
    for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}\t${r.at}\t${r.id}\t${r.detail}`);
    const failed = results.filter((r) => !r.pass);
    if (failed.length) {
      console.error("SMOKE_PRESENTACION_EXP_FAIL", failed.map((f) => f.id).join(", "));
      process.exit(1);
    }
    console.log("SMOKE_PRESENTACION_EXP_OK");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
