#!/usr/bin/env node
/** Playwright DOM-only para QA Money Box RH (usuarios ya creados en VPS). */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";

const __dir = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://187.77.14.148").replace(/\/$/, "");
const WORKSHEET = "/tools/worksheet";
const SHOTS = process.env.QA_RH_MB_SHOTS || resolve(__dir, ".qa-rh-moneybox-shots");
const CASES = JSON.parse(process.env.QA_RH_MB_CASES || "[]");
const RESULTS = resolve(__dir, ".qa-rh-moneybox-dom-results.json");

const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const anon = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
);

async function magicLink(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(error.message);
  return data.properties.action_link;
}

async function login(page, email) {
  await page.goto(await magicLink(email), { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForURL((url) => !url.pathname.includes("/auth/"), { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(2000);
}

async function openWorksheet(page) {
  await page.goto(`${BASE}${WORKSHEET}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("nav.worksheet-rh-tabs, .worksheet-rh, .tool-calc-page", { timeout: 90000 });
  await page.waitForTimeout(1500);
}

async function dumpDebug(page, label) {
  const url = page.url();
  let sessionFlags = null;
  try {
    sessionFlags = await page.evaluate(async () => {
      const res = await fetch("/api/v1/auth/session", { credentials: "include" });
      const json = await res.json();
      return json?.flags ?? json?.profile?.flags ?? null;
    });
  } catch (e) {
    sessionFlags = { error: String(e) };
  }
  const tabs = await page.locator("nav.worksheet-rh-tabs button").allTextContents().catch(() => []);
  console.log(`  debug [${label}] url=${url}`);
  console.log(`  debug tabs=${JSON.stringify(tabs)}`);
  console.log(`  debug session money_box=${sessionFlags?.["worksheet.royal_holiday.money_box"]} rh=${sessionFlags?.["worksheet.royal_holiday"]} worksheet=${sessionFlags?.worksheet}`);
}

async function checkTab(page, expectVisible, label) {
  const nav = page.locator('nav.worksheet-rh-tabs[aria-label="Pestañas worksheet"]');
  await nav.waitFor({ state: "visible", timeout: 60000 });
  try {
    await expect.poll(async () => nav.getByRole("button", { name: "Money Box", exact: true }).count(), {
      timeout: 45000,
    }).toBe(expectVisible ? 1 : 0);
  } catch (e) {
    await dumpDebug(page, label);
    throw e;
  }
  const count = await nav.getByRole("button", { name: "Money Box", exact: true }).count();
  return { domCount: count, ok: (count > 0) === expectVisible };
}

async function checkCalculatorEmbedded(page, label) {
  const tabBtn = page.locator('nav.worksheet-rh-tabs button', { hasText: "Money Box" });
  await tabBtn.click();
  await page.waitForTimeout(800);
  const embedded = page.locator(".money-box-embedded");
  await embedded.waitFor({ state: "visible", timeout: 30000 });
  const tabs = page.locator(".money-box-embedded .money-box-tabs .seg-btn");
  const tabCount = await tabs.count();
  if (tabCount < 3) {
    await dumpDebug(page, `${label}-calc`);
    throw new Error(`Money Box embebido: esperaba 3 sub-pestañas, obtuvo ${tabCount}`);
  }
  await tabs.nth(0).click();
  const input = page.locator(".money-box-panels-stack .money-box-field input").first();
  await input.waitFor({ state: "visible", timeout: 15000 });
  await input.fill("3,000.00");
  await input.blur();
  await page.locator(".money-box-embedded .money-box-refresh-btn").click();
  await page.waitForTimeout(400);
  const matrix = page.locator(".money-box-embedded .money-box-matrix tbody tr");
  const rows = await matrix.count();
  if (rows < 4) {
    throw new Error(`Matriz Money Box vacía (${rows} filas)`);
  }
  return { ok: true, matrixRows: rows };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  let prior = [];
  if (existsSync(RESULTS)) {
    try { prior = JSON.parse(readFileSync(RESULTS, "utf8")); } catch { prior = []; }
  }
  const allResults = [];

  for (const c of CASES) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    console.log(`→ ${c.label} (${c.email})`);
    await login(page, c.email);
    await openWorksheet(page);
    const { domCount, ok } = await checkTab(page, c.expect, c.label);
    let calcOk = null;
    if (c.expect && c.checkCalc) {
      const calc = await checkCalculatorEmbedded(page, c.label);
      calcOk = calc.ok;
    }
    await page.screenshot({ path: resolve(SHOTS, c.shot), fullPage: false });
    const row = { label: c.label, email: c.email, expectVisible: c.expect, domCount, ok, calcOk };
    allResults.push(row);
    console.log(`  ${ok && calcOk !== false ? "OK" : "FAIL"} dom=${domCount} calc=${calcOk ?? "n/a"} esperado=${c.expect ? "visible" : "ausente"}`);
    await context.close();
    if (!ok || calcOk === false) {
      await browser.close();
      writeFileSync(RESULTS, JSON.stringify([...prior, ...allResults], null, 2));
      process.exit(1);
    }
  }

  await browser.close();
  writeFileSync(RESULTS, JSON.stringify([...prior, ...allResults], null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
