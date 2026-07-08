import { test, expect } from "@playwright/test";
import {
  E2E_CLIENT_ID,
  prepareAuthenticatedPage,
  readStoredClient,
} from "./helpers/seed-local-db.js";

const CLIENT_URL = `/clients/${E2E_CLIENT_ID}`;
const SURVEY_URL = `/clients/${E2E_CLIENT_ID}/survey`;

function editModal(page) {
  return page.locator("#m-client-record");
}

test.describe("PDF Correcciones Video — funcionalidad", () => {
  test.beforeEach(async ({ page }) => {
    await prepareAuthenticatedPage(page);
  });

  test("Cambio 1: guardar datos del prospecto persiste y sincroniza Survey", async ({ page }) => {
    await page.goto(CLIENT_URL);
    await expect(page.getByRole("button", { name: /Editar datos/i })).toBeVisible();

    await page.getByRole("button", { name: /Editar datos/i }).click();
    const modal = editModal(page);
    await expect(modal).toBeVisible();

    await modal.locator(".prospect-geo-row select").first().selectOption("México");
    await modal.locator(".prospect-geo-row select").nth(1).selectOption("Cancún");
    await modal.getByRole("combobox").nth(2).selectOption("NQ");

    await modal.getByRole("button", { name: /Guardar datos/i }).click();
    await expect(modal).toBeHidden();

    const summary = page.locator("#prospect-summary-list");
    await expect(summary).toContainText("Cancún");
    await expect(summary).toContainText("México");
    await expect(summary).toContainText("NQ");

    const stored = await readStoredClient(page);
    expect(stored?.country).toBe("México");
    expect(stored?.city).toBe("Cancún");
    expect(stored?.tipo_tour).toBe("NQ");
    expect(stored?.data?.survey?.svp_country).toBe("México");
    expect(stored?.data?.survey?.svp_city).toBe("Cancún");
    expect(stored?.data?.survey?.svp_name1).toBe("EduardoTest");

    await page.reload();
    await expect(page.locator("#prospect-summary-list")).toContainText("Cancún");
    await expect(page.locator("#prospect-summary-list")).toContainText("NQ");

    await page.goto(SURVEY_URL);
    await expect(page.locator("#svp-country")).toHaveValue("México");
    await expect(page.locator("#svp-city")).toHaveValue("Cancún");
  });

  test("Cambio 3: editar datos sin avisos informativos obsoletos", async ({ page }) => {
    await page.goto(CLIENT_URL);
    await page.getByRole("button", { name: /Editar datos/i }).click();

    const modal = page.locator("#m-client-record");
    await expect(modal).toBeVisible();
    await expect(modal.locator(".modal-sub")).toHaveCount(0);
    await expect(modal.locator(".ethic-box")).toHaveCount(0);
    await expect(page.getByText(/información personal es temporal/i)).toHaveCount(0);
    await expect(page.getByText(/Complete only the information/i)).toHaveCount(0);
  });

  test("Cambio 4: totales de vacaciones sin depender del año", async ({ page }) => {
    await page.goto(SURVEY_URL);
    const histCard = page.locator(".card").filter({
      has: page.locator(".card-heading", { hasText: "Últimas 3 vacaciones" }),
    });
    await expect(histCard).toBeVisible();

    const histTable = histCard.locator("table.mtbl");
    const rowInputs = histTable.locator("tbody tr").filter({ has: page.locator("input") });

    await rowInputs.nth(0).locator("td.mc input").fill("2000");
    await rowInputs.nth(1).locator("td.mc input").fill("3000");

    const totalCell = histTable.locator("tr.trow td").last();
    await expect(totalCell).toContainText(/5[,.]?000/);

    const derivedCards = histCard.locator(".survey-result-pair .vbox-val");
    await expect(derivedCards.first()).toContainText(/2[,.]?500/);
  });
});

test.describe("PDF Correcciones Video — responsive móvil", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await prepareAuthenticatedPage(page);
  });

  test("Cambio 2: Country y City apilados en Editar datos sin overflow", async ({ page }) => {
    await page.goto(CLIENT_URL);
    await page.getByRole("button", { name: /Editar datos/i }).click();

    const countryField = page.locator(".prospect-geo-row .prospect-field").first();
    const cityField = page.locator(".prospect-geo-row .prospect-field").nth(1);

    await expect(countryField).toBeVisible();
    await expect(cityField).toBeVisible();

    const countryBox = await countryField.boundingBox();
    const cityBox = await cityField.boundingBox();
    expect(countryBox).toBeTruthy();
    expect(cityBox).toBeTruthy();
    expect(cityBox.y).toBeGreaterThan(countryBox.y + countryBox.height - 4);

    const countrySelect = countryField.locator("select");
    const citySelect = cityField.locator("select");
    await expect(countrySelect).toBeVisible();
    await expect(citySelect).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test("Survey móvil: País y Ciudad apilados sin solapamiento", async ({ page }) => {
    await page.goto(SURVEY_URL);
    await expect(page.locator("#svp-country")).toBeVisible();

    const countryRow = page.locator("#svp-country").locator("xpath=ancestor::div[contains(@class,'client-survey-cfield')]");
    const cityRow = page.locator("#svp-city").locator("xpath=ancestor::div[contains(@class,'client-survey-cfield')]");

    const countryBox = await countryRow.boundingBox();
    const cityBox = await cityRow.boundingBox();
    expect(countryBox).toBeTruthy();
    expect(cityBox).toBeTruthy();
    expect(cityBox.y).toBeGreaterThan(countryBox.y + countryBox.height - 4);

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
