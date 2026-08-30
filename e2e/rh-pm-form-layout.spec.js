/**
 * Smoke layout — formulario Premanifiesto en móvil (labels no se superponen).
 */
import { test, expect } from "@playwright/test";
import { prepareAuthenticatedPage } from "./helpers/seed-local-db.js";

const EMPRESA_ID = "e2e-empresa-rh";
const WORKSPACE_ID = "e2e-workspace-rh";

const DIA_STUB = {
  olas: [{
    ola_config_id: "ola-1",
    etiqueta: "OLA 1",
    hora: "09:00",
    cupo_max: 10,
    ocupado: 2,
    disponible: 8,
    entradas: [
      {
        id: "entry-1",
        prospect_nombre: "QA-gerente-should-fail",
        origen: "marketing",
        status: "en_sala",
        comercial_bloqueado: false,
        show_time: "09:00",
        created_by: "e2e-user",
      },
      {
        id: "entry-2",
        prospect_nombre: "QA-segunda-pareja",
        origen: "marketing",
        status: "pendiente",
        comercial_bloqueado: false,
        show_time: "09:15",
        created_by: "e2e-user",
      },
    ],
  }, {
    ola_config_id: "ola-2",
    etiqueta: "OLA 2",
    hora: "11:00",
    cupo_max: 10,
    ocupado: 0,
    disponible: 10,
    entradas: [],
  }],
};

async function mockPremanifiesto(page) {
  await page.route("**/api/v1/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        user: { id: "e2e-user", email: "e2e@test.local" },
        flags: {
          "rh.tool.premanifiesto.marketing": true,
          "rh.tool.premanifiesto.opc": true,
          "rh.tool.premanifiesto.rep": true,
        },
        workspace_activo: { id: WORKSPACE_ID, empresa_id: EMPRESA_ID },
        workspace_activo_id: WORKSPACE_ID,
      }),
    });
  });

  await page.route(`**/api/v1/royal-holiday/${EMPRESA_ID}/premanifiesto/dia**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: DIA_STUB }),
    });
  });

  await page.route("**/api/v1/rh/empresa**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { empresa_id: EMPRESA_ID, workspace_id: WORKSPACE_ID } }),
    });
  });
}

async function readFirstFieldLayout(page) {
  return page.evaluate(() => {
    const row = document.querySelector(".rh-pm-form-card .tool-frow");
    if (!row) return null;
    const label = row.querySelector(".flabel");
    const input = row.querySelector(".input, select");
    if (!label || !input) return null;
    const lr = label.getBoundingClientRect();
    const ir = input.getBoundingClientRect();
    const cs = getComputedStyle(row);
    const stacked = cs.flexDirection === "column";
    const overlap = lr.bottom > ir.top + 2 && ir.bottom > lr.top + 2
      && lr.left < ir.right - 2 && ir.left < lr.right - 2;
    return {
      flexDirection: cs.flexDirection,
      stacked,
      overlap,
      inputWidthRatio: ir.width / row.getBoundingClientRect().width,
    };
  });
}

test.describe("Premanifiesto form — responsive layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("labels e inputs apilados sin superposición en móvil", async ({ page }) => {
    await prepareAuthenticatedPage(page);
    await mockPremanifiesto(page);
    await page.goto("/ops/rh/premanifiesto", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-testid='rh-pm-page']", { timeout: 30000 });

    const diaTab = page.locator(".rh-pm-subnav .admin-subnav-item", { hasText: /^Día/ });
    if (await diaTab.count()) await diaTab.click();

    await page.locator("button", { hasText: "Editar" }).first().click();
    await page.waitForSelector("[data-testid='rh-pm-form']", { timeout: 15000 });

    const layout = await readFirstFieldLayout(page);
    expect(layout).not.toBeNull();
    expect(layout.stacked).toBe(true);
    expect(layout.overlap).toBe(false);
    expect(layout.inputWidthRatio).toBeGreaterThan(0.85);
  });
});

test.describe("Premanifiesto day panel — card spacing", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("olas y entries con separación vertical clara", async ({ page }) => {
    await prepareAuthenticatedPage(page);
    await mockPremanifiesto(page);
    await page.goto("/ops/rh/premanifiesto", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-testid='rh-pm-page']", { timeout: 30000 });

    const spacing = await page.evaluate(() => {
      const groups = [...document.querySelectorAll(".rh-pm-ola-group")];
      const entries = [...document.querySelectorAll(".rh-pm-entry")];
      const groupGap = groups.length >= 2
        ? groups[1].getBoundingClientRect().top - groups[0].getBoundingClientRect().bottom
        : 0;
      const entryGap = entries.length >= 2
        ? entries[1].getBoundingClientRect().top - entries[0].getBoundingClientRect().bottom
        : 0;
      const olaBodyGap = Number.parseFloat(getComputedStyle(document.querySelector(".rh-pm-ola-body")).gap) || 0;
      return { groupGap, entryGap, olaBodyGap, entryCount: entries.length };
    });

    expect(spacing.entryCount).toBe(2);
    expect(spacing.groupGap).toBeGreaterThanOrEqual(14);
    expect(spacing.entryGap).toBeGreaterThanOrEqual(10);
    expect(spacing.olaBodyGap).toBeGreaterThanOrEqual(10);
  });
});
