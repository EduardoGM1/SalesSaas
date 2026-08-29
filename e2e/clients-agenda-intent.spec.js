/**
 * ClientsPage consume /clients?tourDate=YYYY-MM-DD&from=agenda
 * Ejecutar: npx playwright test e2e/clients-agenda-intent.spec.js
 */
import { test, expect } from "@playwright/test";
import { prepareAuthenticatedPage } from "./helpers/seed-local-db.js";

test.describe("Clientes — intent desde Agenda", () => {
  test.beforeEach(async ({ page }) => {
    await prepareAuthenticatedPage(page);
  });

  test("sin query params no abre el alta", async ({ page }) => {
    await page.goto("/clients");
    await expect(page.getByRole("button", { name: /Nuevo cliente/i })).toBeVisible();
    await expect(page.locator("#nc-name")).toHaveCount(0);
    await expect(page.locator("#nc-tour-date")).toHaveCount(0);

    await page.getByRole("button", { name: /Nuevo cliente/i }).click();
    await expect(page.locator("#nc-name")).toBeVisible();
    await expect(page.locator("#nc-tour-date")).toHaveCount(0);
  });

  test("from=agenda con tourDate válido abre el alta precargada y Cancelar no reabre", async ({ page }) => {
    await page.goto("/clients?tourDate=2026-08-29&from=agenda");
    await expect(page.locator("#nc-name")).toBeVisible();
    await expect(page.locator("#nc-tour-date")).toHaveValue("2026-08-29");
    await expect(page).toHaveURL(/\/clients\/?$/);

    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.locator("#nc-name")).toHaveCount(0);
    await expect(page).toHaveURL(/\/clients\/?$/);
    await page.waitForTimeout(400);
    await expect(page.locator("#nc-name")).toHaveCount(0);
  });

  test("from=agenda sin tourDate no rompe ni abre el alta", async ({ page }) => {
    await page.goto("/clients?from=agenda");
    await expect(page.getByRole("button", { name: /Nuevo cliente/i })).toBeVisible();
    await expect(page.locator("#nc-name")).toHaveCount(0);
    await expect(page).toHaveURL(/\/clients\/?$/);
  });

  test("from=agenda con tourDate malformado no rompe ni abre el alta", async ({ page }) => {
    await page.goto("/clients?from=agenda&tourDate=29-08-2026");
    await expect(page.getByRole("button", { name: /Nuevo cliente/i })).toBeVisible();
    await expect(page.locator("#nc-name")).toHaveCount(0);

    await page.goto("/clients?from=agenda&tourDate=2026-13-40");
    await expect(page.getByRole("button", { name: /Nuevo cliente/i })).toBeVisible();
    await expect(page.locator("#nc-name")).toHaveCount(0);
  });
});
