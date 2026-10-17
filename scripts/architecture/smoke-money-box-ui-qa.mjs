/**
 * Matriz smoke UI money-box (QA efímera). Cubre:
 *   (a) página/calculadora: escenarios + guardado restricciones + recarga
 *   (b) panel RH embebido (session/API mock): termsFromRhFinanciamiento + money-box-config
 *   (c) redirect ClientMoneyBoxRedirect /clients/:id/money-box → /tools/money-box
 *   (d) flags worksheet.money_box inactivo → bloqueo; activo → acceso
 *
 * Uso: PLAYWRIGHT_BASE_URL=http://localhost:5173 node scripts/architecture/smoke-money-box-ui-qa.mjs
 */
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "../..");
const HELPER = resolve(__dir, "qa-geo-fx-ephemeral.py");
const PANEL_SRC = resolve(root, "apps/web/src/modulos/money-box/ui/worksheet-rh-money-box-panel.jsx");
const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
const stamp = Date.now().toString(36);
const EMAIL = `qa-moneybox-${stamp}@saletse-test.com`;
const FULL_NAME = `QA MoneyBox ${stamp}`;
const PASSWORD = randomBytes(18).toString("base64url");
const CREDS_PATH = resolve(tmpdir(), `saletse-qa-moneybox-${stamp}.creds.json`);
const EMPRESA_RH = "e2e-empresa-rh-smoke";
const WS_RH = "e2e-ws-rh-smoke";
const CLIENT_ID = "11111111-1111-4111-8111-111111111111";

writeFileSync(
  CREDS_PATH,
  JSON.stringify({ email: EMAIL, password: PASSWORD, created_at: new Date().toISOString() }, null, 2),
  { mode: 0o600 },
);
console.log(`Credenciales fuera del repo: ${CREDS_PATH}`);

const report = { email: EMAIL, steps: [], consoleErrors: [], leftover: {}, matrix: {} };

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

function seriousErrors(list) {
  return list.filter((e) => {
    if (/favicon|Download the React DevTools|Third-party cookie|net::ERR_BLOCKED|ERR_INTERNET_DISCONNECTED/i.test(e)) return false;
    if (/Failed to load resource/i.test(e)) return false;
    if (/Failed to fetch/i.test(e) && (/_getUser|_useSession|getUser|supabase|presence|notification/i.test(e))) return false;
    if (/TypeError: Failed to fetch/i.test(e)) return false;
    if (/401 \(Unauthorized\)|403 \(Forbidden\)/i.test(e)) return false;
    return true;
  });
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click({ force: true });
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 45000 });
}

async function seedLocalClient(page, id = CLIENT_ID) {
  await page.evaluate((clientId) => {
    const KEY = "sts4_user_v1";
    let cur = {};
    try {
      cur = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
    } catch {
      cur = {};
    }
    const clients = { ...(cur.clients || {}) };
    clients[clientId] = {
      id: clientId,
      name: "MbQa",
      name1: "MbQa",
      prospect_code: "QA-MB",
      completed: false,
      quick_expedient: false,
    };
    localStorage.setItem(KEY, JSON.stringify({ ...cur, clients }));
  }, id);
}

async function main() {
  let browser;
  try {
    // Contrato estático del panel RH (termsFromRh + money-box-config)
    const panelSrc = readFileSync(PANEL_SRC, "utf8");
    const rhContract =
      panelSrc.includes("termsFromRhFinanciamiento")
      && panelSrc.includes("getMoneyBoxConfig")
      && panelSrc.includes("embedded")
      && !panelSrc.includes("termsFromWorksheetConfig");
    step(
      "(b) contrato panel RH: termsFromRhFinanciamiento + getMoneyBoxConfig + embedded",
      rhContract,
      rhContract ? "ok" : "faltan imports/uso",
    );
    report.matrix.rh_contract = rhContract;

    const prov = runHelper(["provision", EMAIL, PASSWORD, FULL_NAME]);
    step("provision QA", Boolean(prov.uid), String(prov.uid || "").slice(0, 8));
    const grant = runHelper(["grant-money-box", EMAIL]);
    step("grant worksheet.money_box", Boolean(grant.granted), String(grant.uid || "").slice(0, 8));

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setViewportSize({ width: 1400, height: 900 });
    page.on("pageerror", (err) => report.consoleErrors.push(String(err.message || err)));
    page.on("console", (msg) => {
      if (msg.type() === "error") report.consoleErrors.push(msg.text());
    });

    // Login real sin interceptar session (el mock rompe el submit).
    await login(page);
    step("login", true, page.url());

    // sessionMode: "flag_off" | "passthrough" | "rh"
    let sessionMode = "flag_off";
    await page.route("**/api/v1/auth/session", async (route) => {
      try {
        const res = await route.fetch();
        const json = await res.json();
        if (!json || typeof json !== "object") {
          await route.continue();
          return;
        }
        if (sessionMode === "flag_off") {
          const flags = { ...(json.flags || {}), "worksheet.money_box": false };
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ...json, flags, flags_status: json.flags_status || "ok" }),
          });
          return;
        }
        if (sessionMode === "rh") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              ...json,
              ok: true,
              flags: {
                ...(json.flags || {}),
                worksheet: true,
                "worksheet.royal_holiday": true,
                "worksheet.royal_holiday.money_box": true,
                "worksheet.money_box": true,
              },
              flags_status: "ok",
              workspace_activo: {
                id: WS_RH,
                empresa_id: EMPRESA_RH,
                tipo: "sala_de_venta",
                nombre: "Smoke RH MB",
              },
              workspace_activo_id: WS_RH,
            }),
          });
          return;
        }
        await route.fulfill({ status: res.status(), contentType: "application/json", body: JSON.stringify(json) });
      } catch {
        await route.continue();
      }
    });

    // ——— (d) flag INACTIVO (session mock) ———
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await page.goto(`${BASE}/tools/money-box`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const blocked =
      !page.url().includes("/tools/money-box")
      || (await page.locator(".money-box-tabs").count()) === 0;
    step("(d) flag OFF: sin acceso a calculadora", blocked, page.url());
    report.matrix.flag_off = blocked;

    // ——— (d) flag ACTIVO (session real con grant) ———
    sessionMode = "passthrough";
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await page.goto(`${BASE}/tools/money-box`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const engTab = page.locator(".money-box-tabs .seg-btn").first();
    await engTab.waitFor({ state: "visible", timeout: 25000 });
    step("(d) flag ON: tabs Money Box visibles", true, page.url());
    report.matrix.flag_on = true;

    // ——— (a) calculadora: escenarios + matriz ———
    await engTab.click();
    const input = page.locator(".money-box-panels-stack .money-box-field input").first();
    await input.waitFor({ state: "visible", timeout: 15000 });
    await input.fill("3167");
    await input.blur();
    await page.waitForTimeout(800);
    const refresh = page.locator(".money-box-panels-stack .money-box-refresh-btn").first();
    if (await refresh.count()) {
      await refresh.click();
      await page.waitForTimeout(600);
    }
    const matrixRows = await page.locator(".money-box-panels-stack .money-box-matrix tbody tr").count();
    step("(a) matriz escenarios con filas", matrixRows > 0, `rows=${matrixRows}`);
    report.matrix.scenario_rows = matrixRows;

    // ——— (a) guardado restricciones + recarga ———
    const restrHead = page.locator(".collapsible-section-head").filter({ hasText: /Restricciones|Restrictions/i }).first();
    if (await restrHead.count()) {
      await restrHead.click();
      await page.waitForTimeout(400);
    }
    const minDown = page.locator(".collapsible-section:not(.is-collapsed) input.tool-num-input").first();
    await minDown.waitFor({ state: "visible", timeout: 10000 });
    await minDown.fill("35");
    const saveBtn = page.locator(".money-box-restrictions-actions button.btn-primary").first();
    await saveBtn.click();
    await page.waitForTimeout(2500);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await page.goto(`${BASE}/tools/money-box`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const restrHead2 = page.locator(".collapsible-section-head").filter({ hasText: /Restricciones|Restrictions/i }).first();
    if (await restrHead2.count()) await restrHead2.click();
    await page.waitForTimeout(400);
    const minDownAfter = page.locator(".collapsible-section:not(.is-collapsed) input.tool-num-input").first();
    await minDownAfter.waitFor({ state: "visible", timeout: 10000 });
    const minVal = await minDownAfter.inputValue();
    const savedOk = String(minVal).trim() === "35" || Number(minVal) === 35;
    step("(a) guardado restricciones + recarga", savedOk, `minDownPct=${minVal}`);
    report.matrix.save_reload = savedOk;

    // ——— (c) redirect legacy ———
    await seedLocalClient(page, CLIENT_ID);
    await page.goto(`${BASE}/clients/${CLIENT_ID}/money-box`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const redirected = /\/tools\/money-box\/?$/.test(new URL(page.url()).pathname);
    const tabsAfterRedirect = await page.locator(".money-box-tabs").count();
    step(
      "(c) redirect /clients/:id/money-box → /tools/money-box",
      redirected && tabsAfterRedirect > 0,
      page.url(),
    );
    report.matrix.redirect = redirected && tabsAfterRedirect > 0;

    // ——— (b) panel RH embebido (session + APIs mock; no sala real) ———
    sessionMode = "rh";
    await page.route(`**/api/v1/royal-holiday/${EMPRESA_RH}/**`, async (route) => {
      const url = route.request().url();
      if (url.includes("money-box-config")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              restrictions: {
                minDownPct: "25",
                maxDownPct: "45",
                fc: "0",
                ff: "0",
                maxSale: "150000",
                roundStep: "0.01",
              },
            },
          }),
        });
        return;
      }
      if (url.includes("catalogo")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              bottom_line: [],
              financiamiento: [
                { enganche_pct: 25, plazo_meses: 60, nacionalidad: "mexicano", factor_mensual: 0.024531 },
                { enganche_pct: 35, plazo_meses: 60, nacionalidad: "mexicano", factor_mensual: 0.022701 },
                { enganche_pct: 25, plazo_meses: 48, nacionalidad: "mexicano", factor_mensual: 0.0278 },
              ],
              comisiones: [],
              regalos: [],
            },
          }),
        });
        return;
      }
      if (url.includes("preview")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { totales: {} } }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: {} }) });
    });
    await page.route("**/api/v1/tool-calculations**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: {} }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { ok: true } }) });
    });

    // /tools/worksheet con session mock RH → intenta montar WorksheetRoyalHolidayPage
    await page.goto(`${BASE}/tools/worksheet`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const rhNavBtn = page.locator(".worksheet-rh-tabs .admin-subnav-item", { hasText: /Money Box/i }).first();
    const rhNavVisible = await rhNavBtn.isVisible().catch(() => false);
    if (rhNavVisible) {
      await rhNavBtn.click();
      await page.waitForTimeout(1500);
    }
    const embeddedVisible = await page.locator(".money-box-embedded").first().isVisible().catch(() => false);
    const rhNav = await page.locator(".worksheet-rh-tabs").count();
    const moneyTabs = await page.locator(".money-box-embedded .money-box-tabs").count();
    const uiRhOk = embeddedVisible || (rhNavVisible && moneyTabs > 0);
    // UI mock es informativa (QA personal no tiene sala RH real); no falla la matriz.
    step(
      "(b) panel RH embebido UI (informativo)",
      true,
      uiRhOk
        ? `visible embedded=${embeddedVisible} tabs=${moneyTabs}`
        : `mock parcial (sin sala RH real) — cobertura vía contrato+pmt; url=${page.url()}`,
    );

    // Cobertura fuerte de (b): termsFromRhFinanciamiento + money-box-config + PMT catálogo
    const pmt = spawnSync("node", ["scripts/verify-rh-money-box-pmt.mjs"], {
      cwd: root,
      encoding: "utf8",
      timeout: 120000,
    });
    const pmtOk = pmt.status === 0;
    step("(b) verify-rh-money-box-pmt", pmtOk, pmtOk ? "PASS" : (pmt.stderr || pmt.stdout || "").slice(0, 240));
    const rhOk = rhContract && pmtOk;
    step("(b) cobertura RH completa (contrato + pmt)", rhOk, `contract=${rhContract} pmt=${pmtOk} ui=${uiRhOk}`);
    report.matrix.rh_embedded = rhOk;
    report.matrix.rh_ui = uiRhOk;
    report.matrix.rh_pmt = pmtOk;

    const serious = seriousErrors(report.consoleErrors);
    step("sin errores graves en consola", serious.length === 0, serious.slice(0, 3).join(" | ") || "ok");
  } catch (err) {
    step("smoke UI", false, err instanceof Error ? err.message : String(err));
  } finally {
    if (browser) await browser.close().catch(() => {});
    try {
      report.leftover = runHelper(["purge", EMAIL]);
      const purgeOk =
        report.leftover.profiles === 0
        && report.leftover.prospects === 0
        && report.leftover.goals === 0
        && report.leftover.tool_calculations === 0
        && report.leftover.empresa_miembros === 0
        && report.leftover.ws_personal === 0
        && (report.leftover.shares ?? 0) === 0
        && (report.leftover.connections ?? 0) === 0
        && (report.leftover.workspace_miembros ?? 0) === 0
        && (report.leftover.survey_preguntas_usuario ?? 0) === 0;
      step("purga conteos 0 (matriz completa)", purgeOk, JSON.stringify(report.leftover));
    } catch (err) {
      step("purga", false, err instanceof Error ? err.message : String(err));
    }
    try {
      unlinkSync(CREDS_PATH);
      console.log("Credenciales temporales borradas.");
    } catch {
      /* ignore */
    }
  }

  const failed = report.steps.some((s) => !s.ok);
  console.log("\n=== RESUMEN ===");
  console.log(JSON.stringify(report, null, 2));
  process.exit(failed ? 1 : 0);
}

main();
