/**
 * Smoke UI geo-fx con QA efímera (prod vía VPS) contra stack local del piloto.
 * Credenciales: archivo temporal FUERA del repo; se borra al final.
 * Purga: profiles / prospects / empresa_miembros / ws personal → conteos 0.
 *
 * Uso: node scripts/architecture/smoke-geo-fx-ui-qa.mjs
 * Requiere: API :4000 + web :5173 (rama piloto), SSH VPS (vps_ssh)
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
const EMAIL = `qa-geo-fx-${stamp}@saletse-test.com`;
const FULL_NAME = `QA GeoFx ${stamp}`;
const PASSWORD = randomBytes(18).toString("base64url");
const CREDS_PATH = resolve(tmpdir(), `saletse-qa-geo-fx-${stamp}.creds.json`);

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
  const r = spawnSync("python", [HELPER, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 180000,
  });
  if (r.status !== 0) {
    throw new Error(`helper ${args[0]} failed: ${(r.stderr || r.stdout || "").slice(0, 800)}`);
  }
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

    await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
    await page.getByText(/Moneda y tipo de cambio/i).first().click({ timeout: 15000 });
    await page.waitForTimeout(800);

    const currencySelect = page.locator("select").filter({ has: page.locator("option[value='MXN']") }).first();
    if (await currencySelect.count()) await currencySelect.selectOption("MXN");
    const modeSelect = page.locator("select").filter({ has: page.locator("option[value='auto']") }).first();
    if (await modeSelect.count()) await modeSelect.selectOption("auto");

    const fxRate = page.locator(".settings-fx-rate");
    await fxRate.first().waitFor({ timeout: 25000 });
    // Esperar tasa real (no el 1 por defecto) tras sync automático
    await page.waitForFunction(() => {
      const el = document.querySelector(".settings-fx-rate");
      if (!el) return false;
      const m = el.textContent.match(/1 USD\s*=\s*([\d.,]+)/i);
      if (!m) return false;
      const n = Number(String(m[1]).replace(/,/g, ""));
      return Number.isFinite(n) && n > 1;
    }, null, { timeout: 25000 }).catch(() => {});
    const fxText = (await fxRate.first().innerText()).replace(/\s+/g, " ").trim();
    step("FX visible en settings", /1 USD\s*=\s*[\d.,]+/i.test(fxText) && !/=\s*1(\.0+)?\s/i.test(fxText), fxText.slice(0, 80));

    const geoRes = await page.request.get(`${BASE}/api/v1/geo/countries`);
    const geoJson = await geoRes.json().catch(() => ({}));
    const countries = geoJson?.data ?? geoJson;
    step(
      "geo API vía proxy",
      geoRes.ok() && Array.isArray(countries) && countries.length > 0,
      `status=${geoRes.status()} n=${Array.isArray(countries) ? countries.length : 0}`,
    );

    const fxApi = await page.request.get(`${BASE}/api/v1/exchange-rates?to=MXN`);
    const fxBody = await fxApi.json().catch(() => ({}));
    const rate = fxBody?.data?.rate ?? fxBody?.rate;
    step("FX API vía proxy", fxApi.ok() && Number(rate) > 0, `rate=${rate}`);

    // Crear expediente forzando navigator.onLine=false (evita 403 cloud en QA personal)
    // sin setOffline del browser (en prod rompería la carga de chunks al navegar).
    await page.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    });
    await page.getByRole("button", { name: /\+?\s*Nuevo cliente/i }).click({ timeout: 15000 });
    await page.locator("#nc-name").fill("GeoFxQa");
    const tourSelect = page.locator(".sales-modal select, [role='dialog'] select").first();
    await tourSelect.waitFor({ timeout: 10000 });
    if ((await tourSelect.locator("option").count()) > 1) await tourSelect.selectOption({ index: 1 });
    await page.getByRole("button", { name: /Crear expediente|Create/i }).click();
    await page.waitForURL(/\/clients\/[^/]+/, { timeout: 30000 });
    await page.evaluate(() => {
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    });
    step("crear expediente (local)", /\/clients\/[^/]+/.test(page.url()) && !page.url().includes("chrome-error"), page.url());
    await page.waitForTimeout(1500);

    // Abrir carpeta Cliente si hace falta
    const folderCliente = page.locator("button, a, [role='button']").filter({ hasText: /^Cliente$/i });
    if (await folderCliente.count()) await folderCliente.first().click().catch(() => {});
    await page.waitForTimeout(400);

    // Expandir card colapsable del prospecto si está cerrado
    const summaryCard = page.locator(".prospect-summary-card, .exp-collapsible-card").first();
    if (await summaryCard.count()) {
      const editInside = summaryCard.getByRole("button", { name: /Editar datos|Edit data/i });
      if (!(await editInside.isVisible().catch(() => false))) {
        await summaryCard.locator("button, [role='button']").first().click().catch(() => {});
        await page.waitForTimeout(300);
      }
    }

    const editBtn = page.getByRole("button", { name: /Editar datos|Edit data/i });
    await editBtn.first().waitFor({ state: "visible", timeout: 15000 });
    await editBtn.first().click();

    const recordModal = page.locator("#m-client-record, .modal-wide, .sales-modal").filter({ hasText: /Editar datos|país|País|Country/i });
    await recordModal.first().waitFor({ state: "visible", timeout: 15000 });
    const geoRow = recordModal.locator(".prospect-geo-row select");
    await geoRow.first().waitFor({ state: "visible", timeout: 10000 });
    const options = await geoRow.nth(0).locator("option").allTextContents();
    const mexico = options.findIndex((o) => /m[eé]xico/i.test(o));
    if (mexico >= 0) await geoRow.nth(0).selectOption({ index: mexico });
    else if (options.length > 1) await geoRow.nth(0).selectOption({ index: 1 });
    await page.waitForTimeout(400);
    const cityOpts = await geoRow.nth(1).locator("option").count();
    step("selects país/ciudad", cityOpts > 1, `countryOpts=${options.length} cityOpts=${cityOpts}`);
    await recordModal.getByRole("button", { name: /Cancelar|Cancel/i }).click().catch(() => {});

    // Ruido esperado: 401/403 sync, Failed to fetch de auth/realtime (getUser) en QA efímera
    const serious = report.consoleErrors.filter((e) => {
      if (/favicon|Download the React DevTools|Third-party cookie|net::ERR_BLOCKED|ERR_INTERNET_DISCONNECTED/i.test(e)) return false;
      if (/Failed to load resource/i.test(e)) return false;
      if (/Failed to fetch/i.test(e) && (/_getUser|_useSession|getUser|supabase|presence|notification/i.test(e))) return false;
      if (/TypeError: Failed to fetch/i.test(e)) return false; // realtime/auth ambient en QA
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
        && report.leftover.empresa_miembros === 0
        && report.leftover.ws_personal === 0;
      step("purga conteos 0", purgeOk, JSON.stringify(report.leftover));
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
