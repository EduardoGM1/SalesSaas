#!/usr/bin/env node
/**
 * Smoke: aviso Settings cuando TC USD→MXN ≤ 1.
 * Credenciales: E2E_EMAIL / E2E_PASSWORD.
 * Base: SMOKE_BASE (default http://127.0.0.1:5173).
 */
import { chromium } from "@playwright/test";

const BASE = (process.env.SMOKE_BASE || "http://127.0.0.1:5173").replace(/\/$/, "");
const EMAIL = process.env.E2E_EMAIL || "";
const PASSWORD = process.env.E2E_PASSWORD || "";

if (!EMAIL || !PASSWORD) {
  console.error("Faltan E2E_EMAIL y E2E_PASSWORD en el entorno (sin defaults en código).");
  process.exit(2);
}

const results = [];
function ts() {
  return new Date().toISOString();
}
function rec(id, pass, detail) {
  results.push({ id, pass, detail, at: ts() });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${ts()} ${id}: ${detail}`);
}

async function openMoneySettings(page) {
  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1000);
  const moneyTitle = page.getByText(/Moneda y tipo de cambio|Currency and exchange rate/i).first();
  await moneyTitle.waitFor({ state: "visible", timeout: 20000 });
  await moneyTitle.click();
  await page.waitForTimeout(600);
}

async function main() {
  console.log("BASE", BASE, "user", EMAIL, "start", ts());
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: "block",
  })).newPage();

  let originalRate = "18";
  let restoreTo = "18";
  try {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.locator('input[name="email"]').fill(EMAIL);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: /iniciar sesión/i }).click();
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 120000 });
    rec("login", true, EMAIL);

    await openMoneySettings(page);
    const rateInput = page.locator(".settings-section input[type=number], .settings-card input[type=number]").first();
    await rateInput.waitFor({ state: "visible", timeout: 15000 });
    originalRate = await rateInput.inputValue();
    restoreTo =
      Number(originalRate) > 1 && Number.isFinite(Number(originalRate))
        ? originalRate
        : "18";

    // Force unusual rate
    await rateInput.fill("1");
    await rateInput.blur();
    await page.waitForTimeout(400);
    const warn = page.getByTestId("settings-fx-unusual-warning");
    const visible = await warn.isVisible().catch(() => false);
    const text = visible ? (await warn.innerText()).trim() : "";
    const ok1 = visible && /Tipo de cambio inusual:\s*1 USD = 1 MXN/i.test(text);
    rec("warning_visible_at_1", ok1, `visible=${visible} text=${text}`);

    // Restore to 18 — warning must hide
    await rateInput.fill("18");
    await rateInput.blur();
    await page.waitForTimeout(400);
    const gone = !(await warn.isVisible().catch(() => false));
    rec("warning_hidden_at_18", gone, gone ? "hidden" : "still visible");

    const save = page.getByRole("button", { name: /guardar|save/i }).first();
    if (await save.count()) await save.click().catch(() => {});
    await page.waitForTimeout(800);
  } catch (e) {
    rec("exception", false, String(e?.message || e).slice(0, 300));
  } finally {
    try {
      await openMoneySettings(page);
      const rateInput = page.locator(".settings-section input[type=number], .settings-card input[type=number]").first();
      if (await rateInput.count()) {
        await rateInput.fill(restoreTo);
        await rateInput.blur();
        const save = page.getByRole("button", { name: /guardar|save/i }).first();
        if (await save.count()) await save.click().catch(() => {});
      }
      rec("restore_rate", true, `rate=${restoreTo} (was ${originalRate})`);
    } catch (re) {
      rec("restore_rate", false, String(re?.message || re).slice(0, 200));
    }
    await browser.close();
    console.log("\n=== SUMMARY ===");
    for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}\t${r.at}\t${r.id}\t${r.detail}`);
    const failed = results.filter((r) => !r.pass && r.id !== "restore_rate");
    if (failed.length) {
      console.error("SMOKE_FX_FAIL", failed.map((f) => f.id).join(", "));
      process.exit(1);
    }
    console.log("SMOKE_FX_OK");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
