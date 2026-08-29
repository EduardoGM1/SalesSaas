/**
 * Modal Agenda "¿Qué te gustaría agregar?": visibilidad de Guardar + persistencia local.
 * Ejecutar: npx playwright test e2e/agenda-entry-modal.spec.js
 */
import { test, expect } from "@playwright/test";
import { prepareAuthenticatedPage } from "./helpers/seed-local-db.js";

const TABS = {
  venta: "Venta",
  follow: "Follow-up",
  clientNote: "Notas para el cliente",
  userNote: "Notas del usuario",
  dayOff: "Descanso",
  noTour: "No tour",
};

function todayParts() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth(),
    day: now.getDate(),
    dateStr: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    calKey: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  };
}

async function mockCalendarApi(page) {
  await page.route("**/api/v1/calendar-entries**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: {} }),
    });
  });
}

async function openAgendaDay(page, day) {
  await page.goto("/");
  await expect(page.locator(".cal-grid")).toBeVisible();
  const dayBtn = page.locator(".cal-grid button.cal-day").filter({
    has: page.locator(".cal-dn").filter({ hasText: new RegExp(`^${day}$`) }),
  });
  await dayBtn.click();
  await page.locator(".add-fab").click();
  await expect(page.locator("#m-entry")).toBeVisible();
  await expect(page.getByText("¿Qué te gustaría agregar?")).toBeVisible();
}

async function selectTab(page, label) {
  await page.locator("#m-entry .entry-type-seg--grid .seg-btn", { hasText: label }).click();
}

async function assertSaveButtonInModal(page) {
  const btn = page.locator("#entry-save-btn");
  await expect(btn).toBeVisible();
  await expect(btn).toHaveClass(/btn-primary/);
  const geometry = await btn.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const modal = el.closest("#m-entry");
    const mr = modal.getBoundingClientRect();
    return {
      height: r.height,
      inModal: r.top >= mr.top - 2 && r.bottom <= mr.bottom + 2,
      clipped: r.bottom > mr.bottom + 2 || r.top < mr.top - 2 || r.height < 8,
    };
  });
  expect(geometry.height, "Guardar debe tener altura visible").toBeGreaterThan(20);
  expect(geometry.inModal, "Guardar debe quedar dentro del modal, no recortado").toBe(true);
  expect(geometry.clipped).toBe(false);
}

async function readCalDay(page, calKey, day) {
  return page.evaluate(
    ({ key, d }) => {
      const raw = localStorage.getItem("sts4_v1");
      if (!raw) return [];
      const db = JSON.parse(raw);
      return db.cal?.[key]?.days?.[d] || [];
    },
    { key: calKey, d: day },
  );
}

test.describe("Agenda — modal de alta", () => {
  test.beforeEach(async ({ page }) => {
    await mockCalendarApi(page);
    await prepareAuthenticatedPage(page);
  });

  test("inventario: Venta/Follow-up/Notas cliente sin Guardar; el resto con Guardar visible", async ({ page }) => {
    const { day } = todayParts();
    await openAgendaDay(page, day);

    for (const label of [TABS.venta, TABS.follow, TABS.clientNote]) {
      await selectTab(page, label);
      await expect(page.locator("#entry-save-btn")).toHaveCount(0);
      await expect(page.locator("#m-entry .route-card")).toHaveCount(2);
      await expect(page.locator("#m-entry .btn-row.entry-modal-actions .btn-ghost")).toBeVisible();
    }

    for (const label of [TABS.userNote, TABS.dayOff, TABS.noTour]) {
      await selectTab(page, label);
      await assertSaveButtonInModal(page);
    }
  });

  test("Notas del usuario: Guardar visible con texto, persiste y sobrevive recarga", async ({ page }) => {
    const { day, calKey } = todayParts();
    const noteText = `nota-usuario-e2e-${Date.now()}`;
    await openAgendaDay(page, day);
    await selectTab(page, TABS.userNote);
    await page.locator("#e-nota-t").fill(noteText);
    await assertSaveButtonInModal(page);
    await page.locator("#entry-save-btn").click();
    await expect(page.locator("#m-entry")).toHaveCount(0);

    await page.locator(".day-group .dg-head", { hasText: "Notas" }).click();
    await expect(page.locator(".day-panel")).toContainText(noteText);

    const stored = await readCalDay(page, calKey, day);
    expect(stored.some((e) => e.t === "nota" && e.kind !== "no-tour" && String(e.note).includes(noteText))).toBe(true);

    await page.reload();
    await expect(page.locator(".cal-grid")).toBeVisible();
    const dayBtn = page.locator(".cal-grid button.cal-day").filter({
      has: page.locator(".cal-dn").filter({ hasText: new RegExp(`^${day}$`) }),
    });
    await dayBtn.click();
    await page.locator(".day-group .dg-head", { hasText: "Notas" }).click();
    await expect(page.locator(".day-panel")).toContainText(noteText);

    await page.locator(".add-fab").click();
    await expect(page.locator("#m-entry")).toBeVisible();
    await selectTab(page, TABS.userNote);
    await assertSaveButtonInModal(page);
    await expect(page.locator("#e-nota-t")).toHaveValue("");
    await page.locator("#m-entry .btn-ghost").click();
    await expect(page.locator(".day-panel")).toContainText(noteText);
  });

  test("Descanso y No tour no guardan al seleccionar; Guardar persiste", async ({ page }) => {
    const { day, calKey } = todayParts();
    await openAgendaDay(page, day);

    await selectTab(page, TABS.dayOff);
    await expect(page.getByText(/Este día se marcará como día de descanso/)).toBeVisible();
    await assertSaveButtonInModal(page);
    expect(await readCalDay(page, calKey, day)).toEqual([]);
    await page.locator("#entry-save-btn").click();
    await expect(page.locator("#m-entry")).toHaveCount(0);
    await page.locator(".day-group .dg-head", { hasText: "Descanso" }).click();
    await expect(page.locator(".day-panel")).toContainText("Día de descanso");

    await page.locator(".add-fab").click();
    await selectTab(page, TABS.noTour);
    const noTourNote = `no-tour-e2e-${Date.now()}`;
    await page.locator("#ef-no-tour textarea").fill(noTourNote);
    await assertSaveButtonInModal(page);
    await page.locator("#entry-save-btn").click();
    await expect(page.locator("#m-entry")).toHaveCount(0);
    await page.locator(".day-group .dg-head", { hasText: "Sin tour" }).click();
    await expect(page.locator(".day-panel")).toContainText(noTourNote);

    const stored = await readCalDay(page, calKey, day);
    expect(stored.some((e) => e.t === "descanso")).toBe(true);
    expect(stored.some((e) => e.kind === "no-tour" && String(e.note).includes(noTourNote))).toBe(true);
  });

  test("Venta / Follow-up / Notas cliente: Crear nuevo cliente abre el alta con tourDate", async ({ page }) => {
    const { day, dateStr } = todayParts();
    for (const label of [TABS.venta, TABS.follow, TABS.clientNote]) {
      await openAgendaDay(page, day);
      await selectTab(page, label);
      await expect(page.locator("#entry-save-btn")).toHaveCount(0);
      await page.locator("#m-entry .route-card.primary-route").click();
      await expect(page.locator("#nc-name")).toBeVisible();
      await expect(page.locator("#nc-tour-date")).toHaveValue(dateStr);
      await expect(page).toHaveURL(/\/clients\/?$/);
      await page.getByRole("button", { name: "Cancelar" }).click();
      await expect(page.locator("#nc-name")).toHaveCount(0);
      await expect(page).toHaveURL(/\/clients\/?$/);
    }
  });

  test("Cliente que ya existe usa la misma URL y abre el mismo alta", async ({ page }) => {
    const { day, dateStr } = todayParts();
    await openAgendaDay(page, day);
    await selectTab(page, TABS.venta);
    await page.locator("#m-entry .route-card.green").click();
    await expect(page.locator("#nc-tour-date")).toHaveValue(dateStr);
    await expect(page).toHaveURL(/\/clients\/?$/);
  });

  test("Guardar no queda recortado en viewport bajo", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 667 });
    const { day } = todayParts();
    await openAgendaDay(page, day);
    await selectTab(page, TABS.userNote);
    await page.locator("#e-nota-t").fill("texto en viewport bajo");
    await assertSaveButtonInModal(page);
    await selectTab(page, TABS.dayOff);
    await assertSaveButtonInModal(page);
  });
});
