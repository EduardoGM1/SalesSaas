/**
 * Smoke DOM — firmas Hoja de trabajo RH (Promotor ← form.opc).
 * Ejecutar: E2E_RH=1 npx playwright test e2e/rh-hoja-firmas.spec.js
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { E2E_CLIENT_ID, prepareAuthenticatedPage } from "./helpers/seed-local-db.js";

const OUT_DIR = path.join(process.cwd(), "e2e", "artifacts", "rh-hoja-firmas");
const EMPRESA_ID = "e2e-empresa-rh";
const WORKSPACE_ID = "e2e-workspace-rh";

function buildRhForm(overrides = {}) {
  return {
    holiday_credits: "10000",
    valor: "",
    valores: ["", "", "", ""],
    epvFvi: ["", "", "", "", ""],
    posicion: "ftb",
    monto_venta: "10000",
    enganche_pct: "25",
    enganche_hoy: "",
    gasto_adm_hoy: "",
    monto_pendiente: "",
    nacionalidad: "mexicano",
    plazo_meses: "24",
    costo_administrativo_usd: "950",
    regalosElegidos: {},
    regalosCantidad: {},
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
    ...overrides,
  };
}

function worksheetBucket(formOverrides) {
  return {
    rh: "1",
    rhTab: "worksheet",
    rhForm_json: JSON.stringify(buildRhForm(formOverrides)),
  };
}

const PARTICIPANTS_FULL = {
  state: {
    representante: { full_name: "Vendedor QA Smoke" },
    gerente: { full_name: "Gerente QA Smoke" },
    cerrador: { full_name: "Cerrador QA Smoke" },
  },
  capabilities: {},
};

const CATALOGO_STUB = {
  bottom_line: [{ hc_rango_min: 0, hc_rango_max: 999999, cuota_anual_mfee: 100, precio_minimo_con_iva: 8000, programa: "Elite" }],
  costo_administrativo: [{ down_payment_pct: 25, monto_usd: 950 }],
  comisiones: [{ down_payment_pct: 15, hc_rango_min: 0, hc_rango_max: 999999, posicion: "ftb", porcentaje_comision: 5 }],
  regalos: [],
  parametros: { tarjetas_internas: ["Invex", "RCI"] },
  financiamiento: [{ plazo_meses: 24, tasa_interes: 12 }],
};

const PREVIEW_STUB = {
  bottom_line: { precio_minimo_con_iva: 8000, cuota_anual_mfee: 100, programa: "Elite" },
  board_online: 8000,
  precio_ok: true,
  costo_administrativo_usd: 950,
  costo_administrativo_base_usd: 950,
  mensualidad: 320,
  plazos: [{ plazo_meses: 24, tasa_interes: 12 }],
  totales: { enganche: 2500, balanceAFinanciar: 7500 },
};

async function mockRhApis(page, { participants = PARTICIPANTS_FULL } = {}) {
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

  await page.route(`**/api/v1/prospects/${E2E_CLIENT_ID}/participants`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: participants }),
    });
  });

  await page.route(`**/api/v1/royal-holiday/${EMPRESA_ID}/catalogo`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: CATALOGO_STUB }),
    });
  });

  await page.route(`**/api/v1/royal-holiday/${EMPRESA_ID}/preview`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: PREVIEW_STUB }),
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

async function prepareRhPage(page, formOverrides) {
  await prepareAuthenticatedPage(page, {
    clients: {
      [E2E_CLIENT_ID]: {
        id: E2E_CLIENT_ID,
        prospectId: E2E_CLIENT_ID,
        prospectCode: "P-E2E001",
        name: "E2E Hoja",
        name1: "E2E Hoja",
        tipo_tour: "Q",
        tour_cuantificable: true,
        completedExpedient: true,
        createdAt: Date.now(),
        createdYmd: "2026-07-07",
        tourDate: "2026-07-07",
        data: {
          survey: {},
          vacaciones: {},
          worksheet: worksheetBucket(formOverrides),
        },
        sales: [],
        activities: [],
      },
    },
  });
  await mockRhApis(page);
}

async function openHojaTab(page) {
  await page.goto(`/clients/${E2E_CLIENT_ID}/worksheet`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".worksheet-rh-tabs", { timeout: 30000 });
  const hojaTab = page.locator(".worksheet-rh-tabs .admin-subnav-item", { hasText: /^Worksheet$/ }).first();
  await hojaTab.click();
  await page.waitForSelector(".worksheet-rh-hoja .rh-hoja-firmas", { timeout: 30000 });
}

async function readFirmas(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll(".rh-hoja-firmas .rh-hoja-firma")].map((el) => ({
      label: el.querySelector(".rh-hoja-firma-label")?.textContent?.trim() ?? "",
      name: el.querySelector(".rh-hoja-firma-line")?.textContent?.trim() ?? "",
      named: el.querySelector(".rh-hoja-firma-line--named") != null,
    })),
  );
}

async function assertPrintLayout(page) {
  return page.evaluate(() => {
    const firmas = document.querySelector(".rh-hoja-firmas");
    const equipo = document.querySelector(".rh-hoja-equipo");
    if (!firmas || !equipo) return { ok: false, reason: "missing firmas block" };
    const count = firmas.querySelectorAll(".rh-hoja-firma").length;
    const gridCols = getComputedStyle(firmas).gridTemplateColumns;
    return {
      ok: count === 5,
      count,
      gridCols,
      firmasHeight: firmas.getBoundingClientRect().height,
      equipoVisible: equipo.offsetParent !== null || getComputedStyle(equipo).display !== "none",
    };
  });
}

test.describe("RH Hoja firmas — Promotor form.opc", () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  });

  test("1) Promotor muestra form.opc capturado", async ({ page }) => {
    await prepareRhPage(page, { opc: "Maria OPC Lobby QA" });
    await openHojaTab(page);

    const firmas = await readFirmas(page);
    const promotor = firmas.find((f) => f.label === "Promotor");
    expect(promotor?.name).toBe("Maria OPC Lobby QA");
    expect(promotor?.named).toBe(true);

    await page.emulateMedia({ media: "print" });
    const printFirmas = await readFirmas(page);
    expect(printFirmas.find((f) => f.label === "Promotor")?.name).toBe("Maria OPC Lobby QA");

    await page.screenshot({ path: path.join(OUT_DIR, "01-promotor-con-opc.png"), fullPage: true });
  });

  test("2) Promotor en blanco sin form.opc — layout intacto", async ({ page }) => {
    await prepareRhPage(page, { opc: "" });
    await openHojaTab(page);

    const firmas = await readFirmas(page);
    const promotor = firmas.find((f) => f.label === "Promotor");
    expect(promotor?.name).toBe("");
    expect(promotor?.named).toBe(false);
    expect(firmas).toHaveLength(5);

    const layout = await assertPrintLayout(page);
    expect(layout.ok).toBe(true);

    await page.emulateMedia({ media: "print" });
    const printLayout = await assertPrintLayout(page);
    expect(printLayout.ok).toBe(true);
    expect(printLayout.count).toBe(5);

    await page.screenshot({ path: path.join(OUT_DIR, "02-promotor-vacio-print.png"), fullPage: true });
  });

  test("3) Conjunto: 3 participantes + opc + Programas en blanco", async ({ page }) => {
    await prepareRhPage(page, { opc: "Promotor Carlos OPC" });
    await openHojaTab(page);

    const firmas = await readFirmas(page);
    expect(firmas).toHaveLength(5);
    expect(firmas.find((f) => f.label === "Representante")?.name).toBe("Vendedor QA Smoke");
    expect(firmas.find((f) => f.label === "Gerente Financiero (1)")?.name).toBe("Gerente QA Smoke");
    expect(firmas.find((f) => f.label === "Gerente Financiero (2)")?.name).toBe("Cerrador QA Smoke");
    expect(firmas.find((f) => f.label === "Promotor")?.name).toBe("Promotor Carlos OPC");
    expect(firmas.find((f) => f.label === "Programas")?.name).toBe("");
    expect(firmas.find((f) => f.label === "Programas")?.named).toBe(false);

    await page.emulateMedia({ media: "print" });
    await page.screenshot({ path: path.join(OUT_DIR, "03-conjunto-cinco-firmas-print.png"), fullPage: true });
  });
});
