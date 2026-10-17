/**
 * Smoke UI módulo money-box: QA efímera + flag worksheet.money_box,
 * /tools/money-box → tabs → input enganche → matriz; purga a 0 (incl. tool_calculations).
 *
 * Uso: PLAYWRIGHT_BASE_URL=http://localhost:5173 node scripts/architecture/smoke-money-box-ui-qa.mjs
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
const EMAIL = `qa-moneybox-${stamp}@saletse-test.com`;
const FULL_NAME = `QA MoneyBox ${stamp}`;
const PASSWORD = randomBytes(18).toString("base64url");
const CREDS_PATH = resolve(tmpdir(), `saletse-qa-moneybox-${stamp}.creds.json`);

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

    const grant = runHelper(["grant-money-box", EMAIL]);
    step("grant worksheet.money_box", Boolean(grant.granted), String(grant.uid || "").slice(0, 8));

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

    await page.goto(`${BASE}/tools/money-box`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    const engTab = page.locator(".money-box-tabs .seg-btn").first();
    await engTab.waitFor({ state: "visible", timeout: 20000 });
    step("tabs Money Box visibles", true);
    await engTab.click();

    // Solo el panel de escenarios (no inputs de restricciones colapsadas).
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

    const matrix = page.locator(".money-box-panels-stack .money-box-matrix tbody tr");
    const rows = await matrix.count();
    step("matriz con filas", rows > 0, `rows=${rows}`);

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
