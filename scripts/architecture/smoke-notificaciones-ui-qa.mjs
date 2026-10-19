/**
 * Smoke UI módulo notificaciones (Tramo A, web): 2 QA efímeras.
 * - Toast simple (agenda sin día seleccionado).
 * - In-app real por Realtime: B comparte un expediente con A → toast-card en A.
 * - Ajustes → Notificaciones: apagar una preferencia, guardar, recargar; persistida en profiles.settings.
 * - Agenda: nota de usuario con recordatorio → fila en scheduled_push_jobs (normalizada a SMOKE_OUT).
 * Purga de ambas QA a 0.
 *
 * Uso: PLAYWRIGHT_BASE_URL=http://localhost:5173 [SMOKE_OUT=<json fuera del repo>] node scripts/architecture/smoke-notificaciones-ui-qa.mjs
 */
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "../..");
const HELPER = process.env.QA_HELPER || resolve(__dir, "qa-geo-fx-ephemeral.py");
const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
const DOMAIN = process.env.QA_EMAIL_DOMAIN || "example.test";
const stamp = Date.now().toString(36);
const A = { email: `qa-notif-a-${stamp}@${DOMAIN}`, name: `QA Notif A ${stamp}`, password: randomBytes(18).toString("base64url") };
const B = { email: `qa-notif-b-${stamp}@${DOMAIN}`, name: `QA Notif B ${stamp}`, password: randomBytes(18).toString("base64url") };
const PROSPECT_ID = randomUUID();
const PROSPECT_NAME = `Cliente Notif ${stamp}`;
const NOTE = "Recordatorio QA notificaciones";
const REM_TIME = "10:30";
const CREDS_PATH = resolve(tmpdir(), `saletse-qa-notif-${stamp}.creds.json`);

writeFileSync(CREDS_PATH, JSON.stringify({ a: A, b: B, created_at: new Date().toISOString() }, null, 2), { mode: 0o600 });
console.log(`Credenciales fuera del repo: ${CREDS_PATH}`);

const report = { steps: [], consoleErrors: [], leftover: {}, job: null };

function step(name, ok, detail = "") {
  report.steps.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function runHelper(args) {
  const r = spawnSync("python", [HELPER, ...args], { cwd: root, encoding: "utf8", timeout: 180000 });
  if (r.status !== 0) throw new Error(`helper ${args[0]}: ${(r.stderr || r.stdout || "").slice(0, 800)}`);
  const line = (r.stdout || "").trim().split(/\r?\n/).filter(Boolean).pop();
  return line ? JSON.parse(line) : {};
}

function fechaLocalMasDias(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Fila comparable entre ramas: sin entry_key/ts ni created_at. */
function normalizarJob(job) {
  const key = String(job.entry_key ?? "");
  const swap = (s) => (key ? String(s).split(key).join("<entry_key>") : String(s));
  return {
    send_at: job.send_at,
    push_type: job.push_type,
    title: job.title,
    body: job.body,
    path: swap(job.path),
    tag: swap(job.tag),
    entry_key: key ? "<entry_key>" : null,
    entry_key_es_ts: /^\d{12,14}$/.test(key),
    status: job.status,
    attempts: job.attempts,
  };
}

async function login(page, user) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"], input[name="email"]').first().fill(user.email);
  await page.locator('input[type="password"], input[name="password"]').first().fill(user.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 45000 });
}

async function abrirAjustesNotificaciones(page) {
  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  await page.locator("button.settings-entry", { hasText: /Notificaciones|Notifications/ }).first().click();
  await page.locator(".notif-pref-row").first().waitFor({ state: "visible", timeout: 20000 });
}

async function main() {
  let browser;
  try {
    step("provision QA A", Boolean(runHelper(["provision", A.email, A.password, A.name]).uid));
    step("provision QA B", Boolean(runHelper(["provision", B.email, B.password, B.name]).uid));

    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    page.on("pageerror", (err) => report.consoleErrors.push(String(err.message || err)));
    page.on("console", (msg) => {
      if (msg.type() === "error") report.consoleErrors.push(msg.text());
    });

    await login(page, A);
    step("login A", true, new URL(page.url()).pathname);

    // Toast simple: "+" sin día seleccionado → toast.info
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.locator("button.add-fab").click();
    const toastItem = page.locator(".toaster .toast-item").first();
    await toastItem.waitFor({ state: "visible", timeout: 10000 });
    step("toast simple visible", true, (await toastItem.innerText()).slice(0, 60));

    // In-app por Realtime: B comparte expediente con A
    await page.waitForTimeout(4000);
    runHelper(["seed-prospect", B.email, PROSPECT_ID, PROSPECT_NAME]);
    runHelper(["seed-collab-share-only", B.email, A.email, PROSPECT_ID, "edit"]);
    const card = page.locator(".toaster .toast-card", { hasText: /compart/i }).first();
    const cardOk = await card.waitFor({ state: "visible", timeout: 20000 }).then(() => true).catch(() => false);
    step("toast in-app (Realtime prospect_shares)", cardOk, cardOk ? (await card.innerText()).replace(/\s+/g, " ").slice(0, 90) : "no apareció");

    // Preferencias: apagar la primera, guardar, recargar
    await abrirAjustesNotificaciones(page);
    const row = page.locator(".notif-pref-row").first();
    const prefTitle = (await row.locator(".notif-pref-title").innerText()).trim();
    const toggle = row.locator("button.notif-toggle");
    const antes = await toggle.getAttribute("aria-checked");
    await toggle.click();
    await page.locator(".page-toolbar button.btn-primary").click();
    await page.waitForTimeout(2500);
    const prefsDb = runHelper(["notif-prefs", A.email]);
    await page.reload({ waitUntil: "domcontentloaded" });
    await abrirAjustesNotificaciones(page);
    const despues = await page.locator(".notif-pref-row").first().locator("button.notif-toggle").getAttribute("aria-checked");
    step("preferencia cambiada y persistida tras recarga", antes === "true" && despues === "false", `${prefTitle}: ${antes} → ${despues}`);
    step("preferencia en profiles.settings", prefsDb.messages === false, JSON.stringify(prefsDb));

    // Agenda: nota de usuario con recordatorio (+3 días, 10:30)
    const remDate = fechaLocalMasDias(3);
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const todayCell = page.locator(".cal-grid .cal-day:not(.other)", { has: page.locator(".cal-dn", { hasText: new RegExp(`^${new Date().getDate()}$`) }) }).first();
    await todayCell.click();
    await page.locator("button.add-fab").click();
    await page.locator(".entry-type-seg .seg-btn").nth(3).click();
    await page.locator("textarea.entry-field-textarea").last().fill(NOTE);
    await page.locator("#e-rem-date").fill(remDate);
    await page.locator("#e-rem-time").fill(REM_TIME);
    await page.locator("#entry-save-btn").click();
    let jobs = [];
    for (let i = 0; i < 15 && jobs.length === 0; i += 1) {
      await page.waitForTimeout(2000);
      jobs = runHelper(["push-jobs", A.email]);
    }
    const job = jobs.find((j) => j.status === "pending") || jobs[0];
    report.job = job ? normalizarJob(job) : null;
    step("fila scheduled_push_jobs", jobs.length === 1 && job?.status === "pending", JSON.stringify(report.job));

    const serious = report.consoleErrors.filter((e) => {
      if (/favicon|Download the React DevTools|Third-party cookie|net::ERR_BLOCKED|ERR_INTERNET_DISCONNECTED/i.test(e)) return false;
      if (/Failed to load resource/i.test(e)) return false;
      if (/Failed to fetch/i.test(e) && /_getUser|_useSession|getUser|supabase|presence|notification/i.test(e)) return false;
      if (/TypeError: Failed to fetch/i.test(e)) return false;
      if (/OneSignal/i.test(e)) return false;
      return true;
    });
    step("sin errores graves en consola", serious.length === 0, serious.slice(0, 3).join(" | ") || "ok");
  } catch (err) {
    step("smoke UI", false, err instanceof Error ? err.message : String(err));
  } finally {
    if (browser) await browser.close().catch(() => {});
    for (const user of [A, B]) {
      try {
        const left = runHelper(["purge", user.email]);
        report.leftover[user === A ? "a" : "b"] = left;
        const ok = Object.values(left).every((v) => v === 0);
        step(`purga QA ${user === A ? "A" : "B"} a 0`, ok, JSON.stringify(left));
      } catch (err) {
        step("purga", false, err instanceof Error ? err.message : String(err));
      }
    }
    try {
      unlinkSync(CREDS_PATH);
      console.log("Credenciales temporales borradas.");
    } catch {
      /* ignore */
    }
  }

  if (process.env.SMOKE_OUT) writeFileSync(process.env.SMOKE_OUT, JSON.stringify(report, null, 2));
  const failed = report.steps.some((s) => !s.ok);
  console.log("\n=== RESUMEN ===");
  console.log(JSON.stringify({ steps: report.steps, job: report.job }, null, 2));
  process.exit(failed ? 1 : 0);
}

main();
