import { test, expect } from "@playwright/test";
import { E2E_CLIENT_ID, seedLocalDatabase } from "./helpers/seed-local-db.js";

const WORKSPACE_RH = "e2e-rh-ws";
const EMPRESA_ID = "e2e-empresa-rh";

test.describe("Money Box — expediente y rutas", () => {
  test("personal: Worksheet sin tarjeta promo Money Box", async ({ page }) => {
    await page.route("**/api/v1/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          user: { id: "e2e-user", email: "e2e@test.local" },
          flags: { worksheet: true, "worksheet.money_box": true },
          flags_status: "ok",
          membership: { plan: "pro", status: "activa" },
        }),
      });
    });
    await seedLocalDatabase(page);
    await page.goto(`/clients/${E2E_CLIENT_ID}?tab=worksheet`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".premium-feature-card")).toHaveCount(0);
    await expect(page.getByText(/Calcula venta posible por enganche/i)).toHaveCount(0);
  });

  test("legacy /clients/:id/money-box redirige a /tools/money-box", async ({ page }) => {
    await page.route("**/api/v1/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          user: { id: "e2e-user", email: "e2e@test.local" },
          flags: { worksheet: true, "worksheet.money_box": true },
          flags_status: "ok",
          membership: { plan: "pro", status: "activa" },
        }),
      });
    });
    await seedLocalDatabase(page);
    await page.goto(`/clients/${E2E_CLIENT_ID}/money-box`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/tools\/money-box$/);
    await expect(page.locator(".money-box-tabs").first()).toBeVisible({ timeout: 15000 });
  });

  test("sala RH: pestaña Money Box en worksheet embebido", async ({ page }) => {
    await page.route("**/api/v1/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          user: { id: "e2e-user", email: "e2e@test.local" },
          flags: {
            worksheet: true,
            "worksheet.royal_holiday": true,
            "worksheet.royal_holiday.money_box": true,
          },
          flags_status: "ok",
          workspace_activo: { id: WORKSPACE_RH, empresa_id: EMPRESA_ID, tipo: "sala_de_venta" },
          workspace_activo_id: WORKSPACE_RH,
        }),
      });
    });
    await page.route(`**/api/v1/royal-holiday/${EMPRESA_ID}/catalogo`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { bottom_line: [], financiamiento: [], comisiones: [], regalos: [] } }),
      });
    });
    await page.route(`**/api/v1/royal-holiday/${EMPRESA_ID}/preview`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { totales: {} } }),
      });
    });
    await page.route(`**/api/v1/royal-holiday/${EMPRESA_ID}/money-box-config`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { restrictions: {}, terms: [] } }),
      });
    });
    await page.route("**/api/v1/tool-calculations**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: {} }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { ok: true } }) });
    });
    await seedLocalDatabase(page);
    await page.goto(`/clients/${E2E_CLIENT_ID}?tab=worksheet&sub=moneybox`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".worksheet-rh-tabs .admin-subnav-item", { hasText: "Money Box" })).toBeVisible();
    await expect(page.locator(".money-box-tabs, .money-box-matrix").first()).toBeVisible({ timeout: 15000 });
  });
});
