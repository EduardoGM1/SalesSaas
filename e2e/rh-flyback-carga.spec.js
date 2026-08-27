/**
 * Smoke DOM — Flyback admite ambas casillas de carga a la vez.
 * Ejecutar: E2E_RH=1 npx playwright test e2e/rh-flyback-carga.spec.js
 */
import { test, expect } from "@playwright/test";
import { E2E_CLIENT_ID, prepareAuthenticatedPage } from "./helpers/seed-local-db.js";

const EMPRESA_ID = "e2e-empresa-rh";
const WORKSPACE_ID = "e2e-workspace-rh";

const FLYBACK = {
  id: "gift-flyback",
  nombre: "Fly Back",
  costo: 1508,
  cargas_permitidas: ["closing_cost", "venta"],
  restricciones: { venta_minima_usd: 19167.58, cantidad_default: 2 },
};

const BONO = {
  id: "gift-bono",
  nombre: "Bono de creditos",
  costo: null,
  cargas_permitidas: ["closing_cost", "venta"],
  restricciones: {
    costo_es_cuota_anual: true,
    cantidad_default: 1,
    cantidad_editable: false,
    hc_bonus_factor: 2,
    hc_bonus_max: 60000,
  },
};

function buildRhForm() {
  return {
    holiday_credits: "25000",
    valor: "",
    valores: ["", "", "", ""],
    epvFvi: ["", "", "", "", ""],
    posicion: "ftb",
    monto_venta: "20000",
    enganche_pct: "25",
    enganche_hoy: "",
    gasto_adm_hoy: "",
    monto_pendiente: "",
    nacionalidad: "mexicano",
    plazo_meses: "24",
    costo_administrativo_usd: "950",
    regalosElegidos: {},
    regalosCantidad: {},
    regalosSplit: {},
    extrasDp: [],
    extrasCc: [],
    enganche_num_pagos: "3",
    enganche_pagos: [],
    gasto_num_pagos: "2",
    gasto_pagos: [],
    opc: "",
    liner: "",
    closer1: "",
    closer2: "",
    exit: "",
    tarjeta_inmex: "",
    tarjeta_rci: "",
    tarjeta_inmex_on: false,
    tarjeta_rci_on: false,
  };
}

const CATALOGO = {
  bottom_line: [{
    id: "bl-gold",
    holiday_credits: 25000,
    cuota_anual_mfee: 1040,
    precio_minimo_con_iva: 19167.58,
    programa: "GOLD",
  }],
  costo_administrativo: [{ down_payment_pct: 25, monto_usd: 950 }],
  comisiones: [{ down_payment_pct: 15, hc_rango_min: 0, hc_rango_max: 999999, posicion: "ftb", porcentaje_comision: 5 }],
  regalos: [FLYBACK, BONO],
  parametros: { tarjetas_internas: ["Invex", "RCI"] },
  financiamiento: [{ plazo_meses: 24, tasa_interes: 12, factor_mensual: 0.05 }],
};

const PREVIEW = {
  bottom_line: CATALOGO.bottom_line[0],
  board_online: 19167.58,
  precio_ok: true,
  costo_administrativo_usd: 950,
  costo_administrativo_base_usd: 950,
  mensualidad: 320,
  plazos: CATALOGO.financiamiento,
  totales: { enganche: 5000, balanceAFinanciar: 15000 },
};

async function mockRh(page) {
  await page.route("**/api/v1/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        user: { id: "e2e-user", email: "e2e@test.local" },
        flags: { worksheet: true, "worksheet.royal_holiday": true },
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
      body: JSON.stringify({ data: PREVIEW }),
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

test.describe("RH Flyback — carga dual", () => {
  test("ambas casillas quedan marcadas y Bono sigue excluyente", async ({ page }) => {
    await prepareAuthenticatedPage(page, {
      clients: {
        [E2E_CLIENT_ID]: {
          id: E2E_CLIENT_ID,
          prospectId: E2E_CLIENT_ID,
          prospectCode: "P-E2E001",
          name: "E2E Flyback",
          name1: "E2E Flyback",
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
    await page.waitForSelector('[data-testid="rh-carga-flyback-venta"]', { timeout: 30000 });

    const venta = page.getByTestId("rh-carga-flyback-venta");
    const closing = page.getByTestId("rh-carga-flyback-closing");
    await venta.check();
    await closing.check();
    await expect(venta).toBeChecked();
    await expect(closing).toBeChecked();
    await expect(page.locator(".rh-flyback-split")).toBeVisible();

    const bonoClosing = page.locator("tr").filter({ hasText: "Bono de creditos" }).getByTestId("rh-carga-closing");
    const bonoVenta = page.locator("tr").filter({ hasText: "Bono de creditos" }).getByTestId("rh-carga-venta");
    await bonoVenta.check();
    await bonoClosing.check();
    await expect(bonoClosing).toBeChecked();
    await expect(bonoVenta).not.toBeChecked();
  });
});
