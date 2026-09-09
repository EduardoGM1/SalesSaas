#!/usr/bin/env node
/**
 * Smoke de los 4 fixes UX OPC (login, avatar, día sin tab, cupo→modal).
 * ROLE=opc | liner | cerrador | gerente
 */
import { mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "@playwright/test";

const __dir = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5178").replace(/\/$/, "");
const SHOTS = process.env.QA_OPC_UX_SHOTS || resolve(__dir, ".qa-opc-ux-shots");
const RESULTS = process.env.QA_OPC_UX_RESULTS || resolve(__dir, ".qa-opc-ux-results.json");
const EMAIL = process.env.QA_OPC_UX_EMAIL;
const PASSWORD = process.env.QA_OPC_UX_PASSWORD;
const ROLE = (process.env.QA_OPC_UX_ROLE || "opc").toLowerCase();

function rec(out, key, ok, detail) {
  out[key] = { pass: !!ok, detail };
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${key}: ${detail}`);
}

async function passwordLogin(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('input[name="email"]').waitFor({ state: "visible", timeout: 30000 });
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator("form").locator('button[type="submit"]').click();
  await page.waitForURL((url) => !String(url.pathname).includes("/login"), { timeout: 45000 });
  await page.waitForTimeout(2000);
}

async function runOpc(page, out) {
  const failed = [];
  page.on("response", (res) => {
    const url = res.url();
    if (res.status() >= 400 && (/\/api\/v1\/(prospects|royal-holiday|session)/.test(url) || url.includes("premanifiesto"))) {
      failed.push(`${res.status()} ${url}`);
    }
  });
  await page.waitForURL((url) => String(url.pathname).includes("/ops/rh/premanifiesto"), { timeout: 25000 }).catch(() => {});
  rec(out, "1.landing", /\/ops\/rh\/premanifiesto/.test(page.url()), page.url());
  const pmVisible = await page.locator('[data-testid="rh-pm-page"]').waitFor({ state: "visible", timeout: 45000 }).then(() => true).catch(() => false);
  if (!pmVisible) {
    const denied = (await page.getByText("No tienes acceso a Premanifiesto").count()) > 0;
    const body = ((await page.locator("main, .app-shell, body").first().innerText().catch(() => "")) || "").slice(0, 400);
    rec(out, "1.pm-page", false, `denied=${denied} http=${failed.join(" | ")} body=${body}`);
    throw new Error(`rh-pm-page no visible: denied=${denied} ${body}`);
  }
  rec(out, "1.pm-page", true, "ok");
  const compactCal = page.locator('.sb-nav a.sb-item[href="/ops/rh/premanifiesto"]');
  await compactCal.waitFor({ state: "visible", timeout: 25000 }).catch(() => {});
  rec(out, "1.compact-cal", (await compactCal.count()) > 0, `count=${await compactCal.count()}`);
  await page.screenshot({ path: `${SHOTS}/1-landing.png`, fullPage: true });

  const avatar = page.locator('[data-testid="sb-user-avatar-link"]');
  await avatar.waitFor({ state: "visible", timeout: 20000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="sb-user-avatar-link"]');
    return el && el.getAttribute("href") === "/ops/rh/premanifiesto";
  }, { timeout: 20000 }).catch(() => {});
  const href = await avatar.getAttribute("href");
  rec(out, "2.avatar-href", href === "/ops/rh/premanifiesto", `href=${href}`);
  await avatar.click();
  await page.waitForTimeout(800);
  rec(out, "2.avatar-nav", /\/ops\/rh\/premanifiesto/.test(page.url()), page.url());
  await page.locator('[data-testid="rh-pm-page"]').waitFor({ state: "visible", timeout: 45000 });

  await page.locator('[data-testid="rh-pm-page"]').waitFor({ state: "visible", timeout: 45000 });
  await page.locator(".rh-pm-day-panel").waitFor({ state: "visible", timeout: 30000 });
  await page.getByText("Cargando olas").waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
  const diaTab = await page.getByRole("button", { name: /^Día / }).count();
  rec(out, "3.no-tab-dia", diaTab === 0, `diaTabs=${diaTab}`);
  await page.locator(".cal-widget").waitFor({ state: "visible", timeout: 15000 });
  const dayBtn = page.locator(".cal-grid button.cal-day:not(.other)").nth(4);
  const beforeTitle = (await page.locator(".day-panel-title").innerText().catch(() => "")).trim();
  if (await dayBtn.count()) await dayBtn.click();
  await page.waitForTimeout(800);
  await page.getByText("Cargando olas").waitFor({ state: "hidden", timeout: 20000 }).catch(() => {});
  const afterTitle = (await page.locator(".day-panel-title").innerText().catch(() => "")).trim();
  rec(
    out,
    "3.day-stays-calendar",
    (await page.locator(".cal-widget").count()) > 0
      && (await page.getByRole("button", { name: /^Día / }).count()) === 0
      && /\/ops\/rh\/premanifiesto/.test(page.url()),
    `titleBefore=${beforeTitle} titleAfter=${afterTitle}`,
  );
  await page.screenshot({ path: `${SHOTS}/3-day.png`, fullPage: true });

  const cupo = page.locator('[data-testid="rh-pm-cupo-libre"]').first();
  const cupoVisible = await cupo.waitFor({ state: "visible", timeout: 25000 }).then(() => true).catch(() => false);
  rec(out, "4.cupo-visible", cupoVisible, cupoVisible ? "ok" : "sin cupo libre");
  if (!cupoVisible) return;
  const cupoBefore = (await cupo.innerText()).trim();
  await cupo.click();
  const modal = page.locator('[data-testid="opc-expediente-modal"]');
  await modal.waitFor({ state: "visible", timeout: 20000 });
  rec(
    out,
    "4.modal-no-nav",
    /\/ops\/rh\/premanifiesto/.test(page.url()) && !(await page.url()).includes("opc-nuevo"),
    page.url(),
  );
  rec(out, "4.tabs", (await page.locator('[data-testid="opc-expediente-tabs"] .admin-subnav-item').count()) === 3, "3 tabs");
  await page.getByTestId("opc-pais").fill("parcial-no-guardar");
  await page.locator(".modal-close").click();
  await modal.waitFor({ state: "hidden", timeout: 10000 });
  rec(out, "4.close-stays-pm", /\/ops\/rh\/premanifiesto/.test(page.url()), page.url());
  const cupoAfterClose = (await page.locator('[data-testid="rh-pm-cupo-libre"]').first().innerText().catch(() => "")).trim();
  rec(out, "4.close-no-cupo-bump", cupoAfterClose === cupoBefore, `before=${cupoBefore} after=${cupoAfterClose}`);
  await page.screenshot({ path: `${SHOTS}/4-after-close.png`, fullPage: true });

  await page.locator('[data-testid="rh-pm-cupo-libre"]').first().click();
  await modal.waitFor({ state: "visible", timeout: 20000 });
  await page.getByTestId("opc-int-hombre-nombre").fill("QaopcUx");
  await page.getByTestId("opc-int-hombre-apellido").fill("Staging");
  await page.locator("text=Instala Sales Timeshare").locator("..").locator("button, .modal-close, [aria-label='Cerrar']").last().click().catch(() => {});
  const confirmBtn = page.getByTestId("opc-confirm");
  await confirmBtn.scrollIntoViewIfNeeded();
  const box = await confirmBtn.boundingBox();
  rec(out, "4.confirm-box", Boolean(box && box.width > 8 && box.height > 8), JSON.stringify(box));
  const postWait = page.waitForResponse(
    (res) => /\/api\/v1\/(prospects|royal-holiday\/.*premanifiesto\/registrar)/.test(res.url()) && res.request().method() !== "GET",
    { timeout: 30000 },
  ).then((res) => `${res.status()} ${res.url()}`).catch((err) => `no-post:${err.message}`);
  await confirmBtn.evaluate((el) => el.click());
  const postDetail = await postWait;
  const confirming = await page.getByText("Confirmando").waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false);
  const toastOk = await page.getByText("Invitación confirmada").waitFor({ state: "visible", timeout: 30000 }).then(() => true).catch(() => false);
  const otherToast = ((await page.locator(".toast-item, .toast-card-title, .toast").allInnerTexts().catch(() => [])) || []).join(" | ");
  await modal.waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
  rec(
    out,
    "4.confirm-stays-pm",
    toastOk && /\/ops\/rh\/premanifiesto/.test(page.url()),
    `confirming=${confirming} toast=${toastOk} post=${postDetail} other=${otherToast} http=${failed.join(" | ")} url=${page.url()}`,
  );
  await page.screenshot({ path: `${SHOTS}/4-after-confirm.png`, fullPage: true });
}

async function runFloorRole(page, out) {
  await page.waitForTimeout(1500);
  const onPm = /\/ops\/rh\/premanifiesto/.test(page.url());
  const onAgenda = /\/$/.test(new URL(page.url()).pathname) || (await page.getByText("Registro operativo diario").count()) > 0;
  rec(out, "1.landing-agenda", !onPm && (onAgenda || new URL(page.url()).pathname === "/"), page.url());
  const avatar = page.locator('[data-testid="sb-user-avatar-link"]');
  if (await avatar.count()) {
    const href = await avatar.getAttribute("href");
    rec(out, "2.avatar-home", href === "/" || href === "", `href=${href}`);
  } else {
    rec(out, "2.avatar-home", false, "sin avatar");
  }
  await page.screenshot({ path: `${SHOTS}/control-${ROLE}.png`, fullPage: true });
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error("Faltan QA_OPC_UX_EMAIL / QA_OPC_UX_PASSWORD");
    process.exit(1);
  }
  mkdirSync(SHOTS, { recursive: true });
  const report = {
    startedAt: new Date().toISOString(),
    role: ROLE,
    base: BASE,
    flow: {},
  };
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  try {
    await passwordLogin(page);
    if (ROLE === "opc") await runOpc(page, report.flow);
    else await runFloorRole(page, report.flow);
  } catch (err) {
    rec(report.flow, "flow.exception", false, err.stack || String(err));
    await page.screenshot({ path: `${SHOTS}/exception.png`, fullPage: true }).catch(() => {});
  } finally {
    await ctx.close();
    await browser.close();
  }
  report.finishedAt = new Date().toISOString();
  const needed = ROLE === "opc"
    ? ["1.landing", "1.compact-cal", "2.avatar-href", "2.avatar-nav", "3.no-tab-dia", "3.day-stays-calendar", "4.cupo-visible", "4.modal-no-nav", "4.tabs", "4.close-stays-pm", "4.close-no-cupo-bump", "4.confirm-stays-pm"]
    : ["1.landing-agenda", "2.avatar-home"];
  report.pass = needed.every((k) => report.flow[k]?.pass === true);
  writeFileSync(RESULTS, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${RESULTS} pass=${report.pass}`);
  process.exit(report.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
