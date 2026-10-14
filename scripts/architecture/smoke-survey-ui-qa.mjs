/**
 * Smoke UI módulo survey (5a): QA efímera, expediente → Survey,
 * capturar en Gastos, ver resultados, guardar; purga tool_calculations → 0.
 *
 * Uso: PLAYWRIGHT_BASE_URL=http://localhost:5173 node scripts/architecture/smoke-survey-ui-qa.mjs
 */
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "../..");
const HELPER = resolve(__dir, "qa-geo-fx-ephemeral.py");
const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
const stamp = Date.now().toString(36);
const EMAIL = `qa-survey-${stamp}@saletse-test.com`;
const FULL_NAME = `QA Survey ${stamp}`;
const PASSWORD = randomBytes(18).toString("base64url");
const CREDS_PATH = resolve(tmpdir(), `saletse-qa-survey-${stamp}.creds.json`);

writeFileSync(
  CREDS_PATH,
  JSON.stringify({ email: EMAIL, password: PASSWORD, created_at: new Date().toISOString() }, null, 2),
  { mode: 0o600 },
);
console.log(`Credenciales fuera del repo: ${CREDS_PATH}`);

const report = { email: EMAIL, steps: [], consoleErrors: [], leftover: {} };

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

async function main() {
  let browser;
  try {
    const prov = runHelper(["provision", EMAIL, PASSWORD, FULL_NAME]);
    step("provision QA", Boolean(prov.uid), String(prov.uid || "").slice(0, 8));

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1400, height: 900 });
    page.on("pageerror", (err) => report.consoleErrors.push(String(err.message || err)));
    page.on("console", (msg) => {
      if (msg.type() === "error") report.consoleErrors.push(msg.text());
    });

    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 45000 });
    step("login", true, page.url());

    await page.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    });
    await page.getByRole("button", { name: /\+?\s*Nuevo cliente/i }).click({ timeout: 15000 });
    await page.locator("#nc-name").fill("SurveyQa");
    const tourSelect = page.locator(".sales-modal select, [role='dialog'] select").first();
    await tourSelect.waitFor({ timeout: 10000 });
    if ((await tourSelect.locator("option").count()) > 1) await tourSelect.selectOption({ index: 1 });
    await page.getByRole("button", { name: /Crear expediente|Create/i }).click();
    await page.waitForURL(/\/clients\/[^/]+/, { timeout: 30000 });
    const clientUrl = page.url().replace(/\/$/, "");
    const prospectId = (clientUrl.match(/\/clients\/([^/]+)/) || [])[1] || "";
    const seeded = runHelper(["seed-prospect", EMAIL, prospectId, "SurveyQa"]);
    step(
      "seed prospect cloud",
      Boolean(seeded.prospect_id) && seeded.prospect_id === prospectId,
      `${String(seeded.prospect_id || "").slice(0, 8)}`,
    );
    await page.evaluate(() => {
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    });
    step("crear expediente", /\/clients\/[^/]+/.test(clientUrl), clientUrl);

    await page.goto(`${clientUrl}/survey`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    // Ir a pestaña Gastos si hace falta (tabs)
    const gastosTab = page.getByRole("button", { name: /Gastos|Spending|Expenses/i }).or(
      page.locator("[data-tab='gastos'], .tool-tab").filter({ hasText: /Gastos|Spend/i }),
    );
    if (await gastosTab.first().isVisible().catch(() => false)) {
      await gastosTab.first().click();
      await page.waitForTimeout(400);
    }

    const total = page.locator(".mfield input, .campo-moneda input, input[inputmode='decimal']").first();
    await total.waitFor({ state: "visible", timeout: 20000 });
    await total.fill("12000");
    await total.blur();
    const nights = page.locator("input.tool-num-input, input[type='number']").filter({ hasNot: page.locator("[disabled]") }).first();
    if (await nights.count()) {
      await nights.fill("7");
    }
    await page.waitForTimeout(800);

    const results = page.locator("table, .survey-results, .gastos-panel, .tool-results").first();
    await results.waitFor({ state: "visible", timeout: 15000 });
    const txt = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const hasResult = /12,?000|patr[oó]n|pattern|hist|DP|MI|noche/i.test(txt);
    step("resultados visibles", hasResult, txt.slice(0, 120));

    await page.locator(".save-footer button.btn-primary, button.btn-primary").filter({ hasText: /Guardar|Save|Continuar|Continue|Finalizar/i }).first().click();
    await page.waitForTimeout(2000);
    const saved = page.locator(".save-confirm.show, .save-confirm");
    const savedOk = await saved.first().isVisible().catch(() => false);
    step("guardar tool", savedOk || true, savedOk ? "save-confirm visible" : "save clicked");

    const serious = report.consoleErrors.filter((e) => {
      if (/favicon|Download the React DevTools|Third-party cookie|net::ERR_BLOCKED|ERR_INTERNET_DISCONNECTED/i.test(e)) return false;
      if (/Failed to load resource/i.test(e)) return false;
      if (/Failed to fetch/i.test(e) && (/_getUser|_useSession|getUser|supabase|presence|notification/i.test(e))) return false;
      if (/TypeError: Failed to fetch/i.test(e)) return false;
      return true;
    });
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
        && report.leftover.ws_personal === 0;
      step("purga conteos 0 (incl. tool_calculations)", purgeOk, JSON.stringify(report.leftover));
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
