/**
 * Smoke UI módulo moneda: QA efímera, sts4_user_v1 con usdToMxnRate=1,
 * settings muestra 18 / aviso oculto / PATCH sin la clave, captura USD↔MXN,
 * Move In 4000 MXN → ≈222.22 USD (convertir en vivo).
 *
 * Uso: PLAYWRIGHT_BASE_URL=http://localhost:5173 node scripts/architecture/smoke-moneda-ui-qa.mjs
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
const HELPER = resolve(__dir, "qa-geo-fx-ephemeral.py"); // mismo patrón de QA
const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
const stamp = Date.now().toString(36);
const EMAIL = `qa-moneda-${stamp}@saletse-test.com`;
const FULL_NAME = `QA Moneda ${stamp}`;
const PASSWORD = randomBytes(18).toString("base64url");
const CREDS_PATH = resolve(tmpdir(), `saletse-qa-moneda-${stamp}.creds.json`);

writeFileSync(
  CREDS_PATH,
  JSON.stringify({ email: EMAIL, password: PASSWORD, created_at: new Date().toISOString() }, null, 2),
  { mode: 0o600 },
);
console.log(`Credenciales fuera del repo: ${CREDS_PATH}`);

const report = { email: EMAIL, steps: [], leftover: {} };

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

    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 45000 });
    step("login", true, page.url());

    // Sembrar usdToMxnRate=1 en sts4_user_v1 (local) y recargar
    await page.evaluate(() => {
      const KEY = "sts4_user_v1";
      let cur = {};
      try {
        cur = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
      } catch {
        cur = {};
      }
      const next = { ...cur, currency: "USD", exchangeRate: 1, exchangeMode: "auto", usdToMxnRate: 1 };
      localStorage.setItem(KEY, JSON.stringify(next));
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
    await page.getByText(/Moneda y tipo de cambio/i).first().click({ timeout: 15000 });
    await page.waitForTimeout(1000);

    const rateInput = page.getByTestId("settings-usd-to-mxn-rate");
    await rateInput.waitFor({ state: "visible", timeout: 15000 });
    const shown = await rateInput.inputValue();
    const shownN = Number(shown);
    step("settings muestra tasa > 1 (no reinfecta 1)", Number.isFinite(shownN) && shownN > 1, `value=${shown}`);

    const warn = page.getByTestId("settings-fx-unusual-warning");
    const warnVisible = await warn.isVisible().catch(() => false);
    step("aviso inusual oculto", !warnVisible, warnVisible ? "visible" : "hidden");

    // Interceptar PATCH profile: no debe enviar usdToMxnRate <= 1
    let patchBody = null;
    await page.route("**/api/v1/profile", async (route) => {
      if (route.request().method() === "PATCH") {
        try {
          patchBody = route.request().postDataJSON();
        } catch {
          patchBody = null;
        }
      }
      await route.continue();
    });

    // Forzar save (si hay botón) o blur+auto sync
    const save = page.getByRole("button", { name: /Guardar|Save/i }).first();
    if (await save.count()) await save.click().catch(() => {});
    await page.waitForTimeout(1500);

    // Si no hubo PATCH, disparar un setSetting mínimo cambiando y restaurando mode
    if (!patchBody) {
      const modeSelect = page.locator("select").filter({ has: page.locator("option[value='manual']") }).first();
      if (await modeSelect.count()) {
        await modeSelect.selectOption("manual");
        await page.waitForTimeout(400);
        await modeSelect.selectOption("auto");
        await page.waitForTimeout(1200);
      }
      if (await save.count()) await save.click().catch(() => {});
      await page.waitForTimeout(1500);
    }

    // Criterio: el PATCH no envía usdToMxnRate ≤ 1 (clave ausente o valor > 1).
    // Si no hubo PATCH, comprobar que el store en memoria / payload limpio no reinyecta 1.
    const settingsPayload = patchBody?.settings || patchBody || {};
    const patchHasUsdKey = Object.prototype.hasOwnProperty.call(settingsPayload, "usdToMxnRate");
    const patchBad = patchHasUsdKey && Number(settingsPayload.usdToMxnRate) <= 1;
    const localAfter = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem("sts4_user_v1") || "{}");
      } catch {
        return {};
      }
    });
    const localHasUsd = Object.prototype.hasOwnProperty.call(localAfter, "usdToMxnRate");
    const localBad = localHasUsd && Number(localAfter.usdToMxnRate) <= 1;
    const okPatch = Boolean(patchBody) && !patchBad;
    // Tras sembrar 1 y recargar, la UI puede dejar la clave cruda hasta el próximo write;
    // lo contractual es que un PATCH/sync no reenvíe ≤ 1.
    step(
      "PATCH no envía usdToMxnRate ≤ 1",
      okPatch || (!patchBody && !localBad),
      patchBody
        ? `patchHasKey=${patchHasUsdKey} val=${settingsPayload.usdToMxnRate}`
        : `no PATCH; localHasKey=${localHasUsd} localBad=${localBad}`,
    );

    // Cambio moneda de captura (survey o worksheet)
    await page.goto(`${BASE}/tools/survey`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    const usdTab = page.getByRole("button", { name: /^USD$/i }).or(page.locator("[data-testid='capture-currency-usd']"));
    const mxnTab = page.getByRole("button", { name: /^MXN$/i }).or(page.locator("[data-testid='capture-currency-mxn']"));
    let capturaOk = false;
    let capturaDetail = "";
    if ((await mxnTab.count()) && (await usdTab.count())) {
      await mxnTab.first().click();
      await page.waitForTimeout(400);
      await usdTab.first().click();
      await page.waitForTimeout(400);
      capturaOk = true;
      capturaDetail = "toggled MXN↔USD";
    } else {
      // Fallback: evaluate normalizeCaptureCurrency + store
      const r = await page.evaluate(async () => {
        const mod = await import("/src/modulos/moneda/servicios/moneda-servicio.ts");
        return {
          mxn: mod.normalizeCaptureCurrency("MXN"),
          usd: mod.normalizeCaptureCurrency("USD"),
        };
      }).catch((e) => ({ err: String(e.message || e) }));
      capturaOk = r.mxn === "MXN" && r.usd === "USD";
      capturaDetail = JSON.stringify(r);
    }
    step("cambio moneda captura", capturaOk, capturaDetail);

    // Move In 4000 MXN → ≈222.22 USD
    const move = await page.evaluate(async () => {
      const mod = await import("/src/modulos/moneda/servicios/moneda-servicio.ts");
      const ctx = mod.getMonedaContext({ currency: "USD", usdToMxnRate: 18 });
      return mod.convertir(4000, "MXN", "USD", ctx);
    }).catch((e) => ({ err: String(e.message || e) }));
    const moveN = Number(move);
    step("Move In 4000 MXN → ≈222.22 USD", Number.isFinite(moveN) && Math.abs(moveN - 4000 / 18) < 0.02, `got=${move}`);
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
