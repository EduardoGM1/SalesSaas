/**
 * Smoke UI/API config de preguntas Survey: QA efímera con y sin permiso
 * `herramientas:survey_configurar_preguntas`; purga a 0 (incl. survey_preguntas_usuario).
 *
 * Requiere API local con el arreglo de permiso (sin deploy a prod).
 * Uso: PLAYWRIGHT_BASE_URL=http://localhost:5173 node scripts/architecture/smoke-survey-config-ui-qa.mjs
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
const EMAIL = `qa-survey-cfg-${stamp}@saletse-test.com`;
const FULL_NAME = `QA SurveyCfg ${stamp}`;
const PASSWORD = randomBytes(18).toString("base64url");
const CREDS_PATH = resolve(tmpdir(), `saletse-qa-survey-cfg-${stamp}.creds.json`);
const TITLE = `Titulo QA ${stamp}`;
const Q_PROBE = "11111111-1111-4111-8111-111111111111";

writeFileSync(
  CREDS_PATH,
  JSON.stringify({ email: EMAIL, password: PASSWORD, created_at: new Date().toISOString() }, null, 2),
  { mode: 0o600 },
);
console.log(`Credenciales fuera del repo: ${CREDS_PATH}`);

const report = { email: EMAIL, base: BASE, steps: [], consoleErrors: [], leftover: {} };

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
    await page.locator("#nc-name").fill("SurveyCfgQa");
    const tourSelect = page.locator(".sales-modal select, [role='dialog'] select").first();
    await tourSelect.waitFor({ timeout: 10000 });
    if ((await tourSelect.locator("option").count()) > 1) await tourSelect.selectOption({ index: 1 });
    await page.getByRole("button", { name: /Crear expediente|Create/i }).click();
    await page.waitForURL(/\/clients\/[^/]+/, { timeout: 30000 });
    const clientUrl = page.url().replace(/\/$/, "");
    const prospectId = (clientUrl.match(/\/clients\/([^/]+)/) || [])[1] || "";
    runHelper(["seed-prospect", EMAIL, prospectId, "SurveyCfgQa"]);
    await page.evaluate(() => {
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    });
    step("crear expediente", Boolean(prospectId), prospectId.slice(0, 8));

    await page.goto(`${clientUrl}/survey`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const motivTab = page.getByRole("button", { name: /Motivaciones|Motivations/i }).or(
      page.locator(".tool-tab, [role='tab']").filter({ hasText: /Motivaciones|Motivations/i }),
    );
    if (await motivTab.first().isVisible().catch(() => false)) {
      await motivTab.first().click();
      await page.waitForTimeout(500);
    }

    // --- SIN permiso (sin override): PUT 403 vía requireWorkspacePermission; GET OK ---
    // Nota: en workspace personal sin role_id la sesión puede aún listar LINER_DEFAULT
    // y mostrar el botón; el API falla cerrado con workspace_has_permission (igual que
    // el resto de mutaciones). Gate de este smoke = PUT 403, no la visibilidad del botón.
    const configBtn = page.locator("button.disc-section-config-btn").first();
    const btnVisibleSin = await configBtn.isVisible().catch(() => false);
    step(
      "sin permiso: nota UI botón",
      true,
      btnVisibleSin
        ? "visible (sesión personal/legacy); API es fuente de verdad"
        : "oculto",
    );

    const putDenied = await page.evaluate(async (preguntaId) => {
      const r = await fetch("/api/v1/survey/questions-config", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seccion: "motivaciones",
          items: [{ pregunta_id: preguntaId, orden: 1, activa: true }],
        }),
      });
      const body = await r.json().catch(() => ({}));
      return { status: r.status, code: body?.code || body?.error || "" };
    }, Q_PROBE);
    step(
      "sin permiso: PUT → 403",
      putDenied.status === 403,
      `status ${putDenied.status} code=${putDenied.code}`,
    );

    const getSin = await page.evaluate(async () => {
      const r = await fetch("/api/v1/survey/questions-config", { credentials: "include" });
      return { status: r.status };
    });
    step("sin permiso: GET → 200", getSin.status === 200, `status ${getSin.status}`);

    // --- CON permiso ---
    const grant = runHelper(["grant-survey-config", EMAIL]);
    step("grant configurar preguntas", Boolean(grant.granted), String(grant.uid || "").slice(0, 8));

    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    await page.goto(`${clientUrl}/survey`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    if (await motivTab.first().isVisible().catch(() => false)) {
      await motivTab.first().click();
      await page.waitForTimeout(500);
    }

    await configBtn.waitFor({ state: "visible", timeout: 20000 });
    await configBtn.click();
    await page.locator(".disc-config-list, .sales-modal .disc-config-row").first().waitFor({
      state: "visible",
      timeout: 15000,
    });
    step("con permiso: abrir modal config", true);

    const expand = page.locator("button.disc-config-expand").first();
    await expand.click();
    const titleInput = page.locator(".disc-config-editor-field input, .disc-config-editor input").first();
    await titleInput.waitFor({ state: "visible", timeout: 10000 });
    await titleInput.fill(TITLE);

    const putPromise = page.waitForResponse(
      (r) =>
        r.url().includes("/api/v1/survey/questions-config") &&
        r.request().method() === "PUT" &&
        r.status() < 500,
      { timeout: 30000 },
    );
    await page
      .locator(".sales-modal button.btn-primary, [role='dialog'] button.btn-primary")
      .filter({ hasText: /Guardar|Save/i })
      .first()
      .click();
    const putRes = await putPromise;
    step("con permiso: PUT questions-config", putRes.ok(), `status ${putRes.status()}`);

    await page.waitForTimeout(800);
    const getJson = await page.evaluate(async () => {
      const r = await fetch("/api/v1/survey/questions-config", { credentials: "include" });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    });
    const overrides = getJson?.body?.data?.overrides || getJson?.body?.overrides || [];
    const hit =
      getJson.status === 200 && overrides.some((o) => String(o?.texto_override || "") === TITLE);
    step("GET refleja override", hit, `status ${getJson.status} overrides=${overrides.length}`);

    await page.waitForTimeout(600);
    const bodyTxt = await page.locator("body").innerText();
    step("Survey usa título override", bodyTxt.includes(TITLE), TITLE);

    const leftoverMid = runHelper(["counts", EMAIL]);
    step(
      "config filas > 0 tras guardar",
      (leftoverMid.survey_preguntas_usuario || 0) > 0,
      String(leftoverMid.survey_preguntas_usuario),
    );
  } catch (err) {
    step("smoke config", false, err instanceof Error ? err.message : String(err));
  } finally {
    if (browser) await browser.close().catch(() => {});
    try {
      report.leftover = runHelper(["purge", EMAIL]);
      const ok =
        report.leftover.profiles === 0 &&
        report.leftover.prospects === 0 &&
        report.leftover.tool_calculations === 0 &&
        (report.leftover.survey_preguntas_usuario || 0) === 0;
      step("purga conteos 0 (incl. survey_preguntas_usuario)", ok, JSON.stringify(report.leftover));
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

  console.log("\n=== RESUMEN CONFIG ===\n" + JSON.stringify(report, null, 2));
  const failed = report.steps.some((s) => !s.ok);
  process.exit(failed ? 1 : 0);
}

main();
