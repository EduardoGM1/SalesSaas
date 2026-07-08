/** @typedef {import("../../apps/web/src/lib/storage/types.ts").AppDatabase} AppDatabase */

export const E2E_CLIENT_ID = "e2e-video-pdf-client";

/**
 * Evita redirección a /login cuando el dev server tiene Supabase configurado.
 * @param {import("@playwright/test").Page} page
 */
export async function mockAuthenticatedSession(page) {
  await page.route("**/api/v1/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, user: { id: "e2e-user", email: "e2e@test.local" } }),
    });
  });
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {Partial<AppDatabase>} [overrides]
 */
export async function seedLocalDatabase(page, overrides = {}) {
  await page.addInitScript(({ db }) => {
    if (sessionStorage.getItem("e2e-db-seeded") === "1") return;
    localStorage.setItem("sts4_v1", JSON.stringify(db));
    sessionStorage.setItem("e2e-db-seeded", "1");
  }, {
    db: buildSeedDatabase(overrides),
  });
}

/** Prepara página autenticada con datos locales. */
export async function prepareAuthenticatedPage(page, overrides = {}) {
  await mockAuthenticatedSession(page);
  await seedLocalDatabase(page, overrides);
}

/** @param {Partial<AppDatabase>} [overrides] */
export function buildSeedDatabase(overrides = {}) {
  const base = {
    clients: {
      [E2E_CLIENT_ID]: {
        id: E2E_CLIENT_ID,
        prospectId: E2E_CLIENT_ID,
        prospectCode: "P-E2E001",
        name: "EduardoTest",
        name1: "EduardoTest",
        name2: "",
        tipo_tour: "Q",
        tour_cuantificable: true,
        country: "",
        city: "",
        occupation1: "",
        createdAt: Date.now(),
        createdYmd: "2026-07-07",
        tourDate: "2026-07-07",
        quickExpedient: false,
        completedExpedient: true,
        data: { survey: {}, vacaciones: {}, worksheet: {} },
        sales: [],
        activities: [],
      },
    },
    sales: {},
    libre: {},
    cal: {},
    goals: {},
    userActivities: [],
    settings: {
      language: "es",
      currency: "USD",
      exchangeRate: 1,
      exchangeMode: "auto",
      userName: "E2E",
      userInitials: "E2",
    },
  };

  return {
    ...base,
    ...overrides,
    clients: { ...base.clients, ...(overrides.clients || {}) },
    settings: { ...base.settings, ...(overrides.settings || {}) },
  };
}

/**
 * @param {import("@playwright/test").Page} page
 */
export async function readStoredClient(page, clientId = E2E_CLIENT_ID) {
  return page.evaluate((id) => {
    const raw = localStorage.getItem("sts4_v1");
    if (!raw) return null;
    const db = JSON.parse(raw);
    return db.clients?.[id] ?? null;
  }, clientId);
}
