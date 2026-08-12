/**
 * Auditoría responsive — solo diagnóstico (capturas + detección overflow horizontal).
 * Ejecutar: PLAYWRIGHT_SKIP_SERVERS=1 PLAYWRIGHT_BASE_URL=http://localhost:5173 npx playwright test responsive-audit
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { prepareAuthenticatedPage, E2E_CLIENT_ID } from "./helpers/seed-local-db.js";

const OUT_DIR = path.join(process.cwd(), "e2e", "artifacts", "responsive-audit");

const VIEWPORTS = [
  { name: "mobile-se", width: 320, height: 568 },
  { name: "mobile-14", width: 390, height: 844 },
  { name: "mobile-lg", width: 430, height: 932 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "tablet-land", width: 1024, height: 768 },
  { name: "desktop", width: 1280, height: 800 },
  { name: "desktop-xl", width: 1440, height: 900 },
  { name: "wide", width: 1920, height: 1080 },
];

/** @typedef {{ route: string; label: string; auth?: boolean; rh?: boolean; waitMs?: number; actions?: (page: import('@playwright/test').Page) => Promise<void> }} ScreenDef */

/** @type {ScreenDef[]} */
const SCREENS = [
  { route: "/login", label: "login", auth: false },
  { route: "/register", label: "register", auth: false },
  { route: "/", label: "agenda", auth: true },
  { route: "/clients", label: "clientes", auth: true },
  { route: `/clients/${E2E_CLIENT_ID}`, label: "expediente-detalle", auth: true, waitMs: 800 },
  { route: `/clients/${E2E_CLIENT_ID}/worksheet`, label: "worksheet-regular", auth: true, waitMs: 1200 },
  { route: "/tools/worksheet", label: "worksheet-libre", auth: true, waitMs: 1200 },
  { route: "/sales", label: "dashboard-ventas", auth: true, waitMs: 600 },
  { route: "/settings", label: "settings", auth: true },
  { route: "/admin", label: "admin-overview", auth: true, waitMs: 600 },
  { route: "/admin/users", label: "admin-users", auth: true, waitMs: 600 },
  { route: "/admin/empresas", label: "admin-empresas", auth: true, waitMs: 600 },
];

/** @type {ScreenDef[]} */
const RH_SCREENS = [
  {
    route: `/clients/${E2E_CLIENT_ID}/worksheet`,
    label: "worksheet-rh-venta",
    auth: true,
    rh: true,
    waitMs: 1500,
    actions: async (page) => {
      const ventaTab = page.locator(".worksheet-rh-tabs .admin-subnav-item", { hasText: /Venta|Datos venta/i }).first();
      if (await ventaTab.count()) await ventaTab.click();
    },
  },
  {
    route: `/clients/${E2E_CLIENT_ID}/worksheet`,
    label: "worksheet-rh-financiamiento",
    auth: true,
    rh: true,
    waitMs: 1500,
    actions: async (page) => {
      const finTab = page.locator(".worksheet-rh-tabs .admin-subnav-item", { hasText: /Financiamiento/i }).first();
      if (await finTab.count()) await finTab.click();
    },
  },
];

async function mockRhFlags(page) {
  await page.route("**/api/v1/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        user: { id: "e2e-user", email: "e2e@test.local" },
        flags: { "worksheet.royal_holiday": true, worksheet: true },
      }),
    });
  });
}

async function detectIssues(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const overflowX = Math.max(doc.scrollWidth, body?.scrollWidth ?? 0) - doc.clientWidth;
    const smallTap = [];
    for (const el of document.querySelectorAll("button, a.btn, .admin-subnav-item, .bottom-nav-item, input, select, textarea")) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.width < 32 || r.height < 32) {
        const label = (el.getAttribute("aria-label") || el.textContent || el.className || el.tagName).trim().slice(0, 40);
        smallTap.push({ label, w: Math.round(r.width), h: Math.round(r.height) });
      }
    }
    return {
      overflowX: Math.round(overflowX),
      viewportW: window.innerWidth,
      smallTap: smallTap.slice(0, 12),
    };
  });
}

function statusFrom(metrics) {
  if (metrics.overflowX > 2) return "broken";
  if (metrics.smallTap.length > 4) return "minor";
  return "ok";
}

test.describe("Responsive audit", () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  });

  for (const vp of VIEWPORTS) {
    for (const screen of SCREENS) {
      test(`${screen.label} @ ${vp.name} (${vp.width}px)`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        if (screen.auth) await prepareAuthenticatedPage(page);
        await page.goto(screen.route, { waitUntil: "domcontentloaded" });
        if (screen.waitMs) await page.waitForTimeout(screen.waitMs);
        if (screen.actions) await screen.actions(page);

        const metrics = await detectIssues(page);
        const shot = path.join(OUT_DIR, `${screen.label}__${vp.name}.png`);
        await page.screenshot({ path: shot, fullPage: true });

        const reportLine = {
          screen: screen.label,
          viewport: vp.name,
          width: vp.width,
          overflowX: metrics.overflowX,
          smallTapCount: metrics.smallTap.length,
          status: statusFrom(metrics),
        };
        fs.appendFileSync(path.join(OUT_DIR, "report.jsonl"), `${JSON.stringify(reportLine)}\n`);

        if (metrics.overflowX > 2) {
          console.warn(`OVERFLOW ${screen.label}@${vp.name}: ${metrics.overflowX}px`);
        }
        expect(metrics.overflowX, `scroll horizontal en ${screen.label}@${vp.name}`).toBeLessThanOrEqual(8);
      });
    }

    for (const screen of RH_SCREENS) {
      test(`${screen.label} @ ${vp.name} (${vp.width}px)`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await prepareAuthenticatedPage(page);
        await mockRhFlags(page);
        await page.goto(screen.route, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(screen.waitMs ?? 1000);
        if (screen.actions) await screen.actions(page);

        const metrics = await detectIssues(page);
        const shot = path.join(OUT_DIR, `${screen.label}__${vp.name}.png`);
        await page.screenshot({ path: shot, fullPage: true });

        fs.appendFileSync(
          path.join(OUT_DIR, "report.jsonl"),
          `${JSON.stringify({
            screen: screen.label,
            viewport: vp.name,
            width: vp.width,
            overflowX: metrics.overflowX,
            smallTapCount: metrics.smallTap.length,
            status: statusFrom(metrics),
          })}\n`,
        );

        expect(metrics.overflowX, `scroll horizontal en ${screen.label}@${vp.name}`).toBeLessThanOrEqual(8);
      });
    }
  }
});
