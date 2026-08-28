/**
 * Smoke layout — tablas Membresías y Generar más escenarios en viewports móviles RH.
 * Ejecutar: E2E_RH=1 npx playwright test e2e/rh-tables-mobile.spec.js
 */
import { test, expect } from "@playwright/test";
import { E2E_CLIENT_ID, prepareAuthenticatedPage } from "./helpers/seed-local-db.js";

const EMPRESA_ID = "e2e-empresa-rh";
const WORKSPACE_ID = "e2e-workspace-rh";

const VIEWPORTS = [
  { name: "mobile-se", width: 320, height: 568 },
  { name: "mobile-14", width: 390, height: 844 },
  { name: "mobile-lg", width: 430, height: 932 },
  { name: "tablet", width: 768, height: 1024 },
];

const CATALOGO = {
  bottom_line: [
    { id: "bl-brz", holiday_credits: 10000, cuota_anual_mfee: 700, precio_minimo_con_iva: 10681, programa: "BRZ+" },
    { id: "bl-slvr", holiday_credits: 15000, cuota_anual_mfee: 805, precio_minimo_con_iva: 14269, programa: "SLVR" },
    { id: "bl-slv", holiday_credits: 20000, cuota_anual_mfee: 945, precio_minimo_con_iva: 16631, programa: "SLV+" },
    { id: "bl-gold", holiday_credits: 25000, cuota_anual_mfee: 1040, precio_minimo_con_iva: 19167.5, programa: "GOLD" },
    { id: "bl-goldp", holiday_credits: 30000, cuota_anual_mfee: 1170, precio_minimo_con_iva: 21922, programa: "GOLD+" },
  ],
  costo_administrativo: [{ down_payment_pct: 25, monto_usd: 950 }],
  comisiones: [{ down_payment_pct: 15, hc_rango_min: 0, hc_rango_max: 999999, posicion: "ftb", porcentaje_comision: 5 }],
  regalos: [],
  parametros: { tarjetas_internas: ["Invex"] },
  financiamiento: [
    { enganche_pct: 25, plazo_meses: 60, nacionalidad: "mexicano", tasa_interes: 16.99, factor_mensual: 0.024531 },
    { enganche_pct: 25, plazo_meses: 48, nacionalidad: "mexicano", tasa_interes: 14.99, factor_mensual: 0.0278 },
    { enganche_pct: 35, plazo_meses: 60, nacionalidad: "mexicano", tasa_interes: 12.99, factor_mensual: 0.022701 },
    { enganche_pct: 35, plazo_meses: 48, nacionalidad: "mexicano", tasa_interes: 10.9, factor_mensual: 0.0255 },
    { enganche_pct: 45, plazo_meses: 12, nacionalidad: "mexicano", tasa_interes: 0, factor_mensual: 1 / 12 },
  ],
};

function buildRhForm() {
  return {
    holiday_credits: "25000",
    valor: "",
    valores: ["", "", "", ""],
    epvFvi: ["", "", "", "", ""],
    posicion: "ftb",
    monto_venta: "19200",
    enganche_pct: "25",
    enganche_hoy: "",
    gasto_adm_hoy: "",
    monto_pendiente: "",
    nacionalidad: "mexicano",
    plazo_meses: "60",
    costo_administrativo_usd: "950",
    regalosElegidos: {},
    regalosCantidad: {},
    regalosSplit: {},
  };
}

async function mockRh(page) {
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
        workspace_activo: { id: WORKSPACE_ID, empresa_id: EMPRESA_ID },
        workspace_activo_id: WORKSPACE_ID,
        profile: { workspace_activo_id: WORKSPACE_ID },
      }),
    });
  });
  await page.route(`**/api/v1/royal-holiday/${EMPRESA_ID}/catalogo`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: CATALOGO }),
    });
  });
  await page.route(`**/api/v1/royal-holiday/${EMPRESA_ID}/preview`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          bottom_line: CATALOGO.bottom_line[3],
          board_online: 19167.5,
          precio_ok: true,
          costo_administrativo_usd: 950,
          mensualidad: 320,
          plazos: CATALOGO.financiamiento.filter((r) => r.enganche_pct === 25),
          totales: { enganche: 4800, balanceAFinanciar: 14400 },
        },
      }),
    });
  });
  await page.route(`**/api/v1/royal-holiday/${EMPRESA_ID}/money-box-config`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          plans: {},
          restrictions: { minDownPct: "25", maxDownPct: "45", fc: "0", ff: "0", maxSale: "150000", roundStep: "0.01" },
        },
      }),
    });
  });
  await page.route("**/api/v1/tool-calculations**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: {} }) });
      return;
    }
    await route.continue();
  });
}

async function assertCellsFit(locator, label) {
  const overflow = await locator.evaluate((table) => {
    const issues = [];
    for (const cell of table.querySelectorAll("th, td")) {
      if (cell.scrollWidth > cell.clientWidth + 1) {
        issues.push((cell.textContent || "").trim().slice(0, 48));
      }
    }
    return issues;
  });
  expect(overflow, `${label}: celdas que se salen (${overflow.join(" | ")})`).toEqual([]);
}

test.describe("RH tablas móviles", () => {
  for (const vp of VIEWPORTS) {
    test(`Membresías y escenarios @ ${vp.name} (${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await prepareAuthenticatedPage(page, {
        clients: {
          [E2E_CLIENT_ID]: {
            id: E2E_CLIENT_ID,
            prospectId: E2E_CLIENT_ID,
            prospectCode: "P-E2E001",
            name: "E2E Tablas",
            name1: "E2E Tablas",
            tipo_tour: "Q",
            tour_cuantificable: true,
            completedExpedient: true,
            createdAt: Date.now(),
            createdYmd: "2026-07-07",
            tourDate: "2026-07-07",
            data: {
              survey: {},
              vacaciones: {},
              worksheet: { rh: "1", rhTab: "venta", rhForm_json: JSON.stringify(buildRhForm()) },
            },
            sales: [],
            activities: [],
          },
        },
      });
      await mockRh(page);
      await page.goto(`/clients/${E2E_CLIENT_ID}/worksheet`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".worksheet-rh-tabs", { timeout: 30000 });

      await page.locator(".worksheet-rh-tabs .admin-subnav-item", { hasText: /Datos Venta/i }).click();
      const membership = page.locator(".rh-bl-membership-table");
      await expect(membership).toBeVisible({ timeout: 30000 });
      await expect(page.locator(".rh-bl-membership-table tbody tr.is-selected")).toContainText(/GOLD/);
      await assertCellsFit(membership, `membresías ${vp.name}`);
      await assertCellsFit(page.locator(".rh-bl-membership-table tbody tr.is-selected"), `GOLD ${vp.name}`);

      await page.locator(".worksheet-rh-tabs .admin-subnav-item", { hasText: /Money Box/i }).click();
      const matrix = page.locator(".money-box-matrix");
      await expect(matrix).toBeVisible({ timeout: 30000 });
      await expect(matrix).not.toContainText(/12\.99%/);
      await assertCellsFit(matrix, `escenarios ${vp.name}`);
    });
  }
});
