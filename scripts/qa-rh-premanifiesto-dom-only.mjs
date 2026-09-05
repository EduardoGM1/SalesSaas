#!/usr/bin/env node
/** Playwright DOM Premanifiesto RH — usuarios QA ya creados en VPS. */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";

const __dir = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://187.77.14.148").replace(/\/$/, "");
const SHOTS = process.env.QA_RH_PM_SHOTS || resolve(__dir, ".qa-rh-pm-shots");
const CASES = JSON.parse(process.env.QA_RH_PM_CASES || "[]");
const RESULTS = resolve(__dir, ".qa-rh-pm-dom-results.json");

const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

async function magicLink(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(error.message);
  return data.properties.action_link;
}

async function login(page, email) {
  await page.goto(await magicLink(email), { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForURL((url) => !url.pathname.includes("/auth/"), { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function runCase(page, c) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page, c.email);
  const results = [];

  if (c.checkHubHidden) {
    await page.goto(`${BASE}/ops/rh`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(1000);
    const pmLink = page.getByRole("link", { name: "Premanifiesto" });
    const count = await pmLink.count();
    results.push({
      label: c.label,
      check: "hub hidden",
      ok: count === 0,
      detail: `links=${count}`,
    });
    if (c.shot) await page.screenshot({ path: `${SHOTS}/${c.shot}`, fullPage: true });
    return results;
  }

  await page.goto(`${BASE}/ops/rh/premanifiesto`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector('[data-testid="rh-pm-page"]', { timeout: 60000 });

  if (c.checkCalendar) {
    await expect(page.locator(".cal-widget")).toBeVisible();
    await expect(page.locator('[data-testid="rh-pm-day-panel"]')).toBeVisible({ timeout: 45000 });
    const dayBtn = page.locator(".cal-grid button.cal-day:not(.other)").nth(5);
    if (await dayBtn.count()) await dayBtn.click();
    await expect(page.locator(".rh-pm-ola-group").first()).toBeVisible({ timeout: 45000 });
    results.push({ label: c.label, check: "calendar day olas", ok: true, detail: "cal+olas OK" });
  }

  if (c.checkOpcBadge) {
    await page.getByRole("button", { name: /^Día / }).click();
    await expect(page.getByText("QA DOM Badge OPC")).toBeVisible({ timeout: 20000 });
    await expect(page.locator('[data-testid="rh-pm-badge-opc"]').first()).toBeVisible({ timeout: 20000 });
    results.push({ label: c.label, check: "opc badge", ok: true, detail: "badge visible" });
  }

  if (c.checkOpcForm) {
    if (await page.locator('[data-testid="rh-pm-form"]').count()) {
      await page.getByRole("button", { name: "Cancelar" }).click();
    }
    await expect(page.getByRole("button", { name: "Invitar pareja" })).toHaveCount(0);
    const cupoLibre = page.locator('[data-testid="rh-pm-cupo-libre"]').first();
    await expect(cupoLibre).toBeVisible({ timeout: 30000 });
    await cupoLibre.click();
    await expect(page).toHaveURL(/\/clients\/opc-nuevo/);
    await expect(page.locator('[data-testid="opc-expediente-tabs"]')).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("button", { name: "Información cliente" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Estancia" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Invitación" })).toBeVisible();
    results.push({
      label: c.label,
      check: "opc expediente 3 tabs",
      ok: true,
      detail: "cupo→opc-nuevo",
    });
  }

  if (c.checkGerenteReadOnly) {
    const regBtn = page.getByRole("button", { name: "Registrar pareja" });
    const invBtn = page.getByRole("button", { name: "Invitar pareja" });
    const regCount = await regBtn.count();
    const invCount = await invBtn.count();
    results.push({
      label: c.label,
      check: "gerente read-only",
      ok: regCount === 0 && invCount === 0,
      detail: `reg=${regCount} inv=${invCount}`,
    });
    await expect(page.locator(".rh-pm-ola-group").first()).toBeVisible();
  }

  if (c.shot) await page.screenshot({ path: `${SHOTS}/${c.shot}`, fullPage: true });
  return results;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const all = [];
  try {
    for (const c of CASES) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      try {
        const part = await runCase(page, c);
        all.push(...part.map((r) => ({ ...r, caseLabel: c.label })));
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }

  writeFileSync(RESULTS, JSON.stringify(all, null, 2));
  const failed = all.filter((r) => !r.ok).length;
  for (const r of all) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  [${r.caseLabel}] ${r.check}: ${r.detail}`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
