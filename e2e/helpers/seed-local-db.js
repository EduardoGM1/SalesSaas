/** @typedef {import("../../apps/web/src/lib/storage/types.ts").AppDatabase} AppDatabase */

export const E2E_CLIENT_ID = "e2e-video-pdf-client";
export const E2E_USER_ID = "e2e-user";
export const E2E_WORKSPACE_ID = "e2e-workspace-personal";

/**
 * Evita redirección a /login cuando el dev server tiene Supabase configurado.
 * @param {import("@playwright/test").Page} page
 * Sin `flags` la app no tiene catálogo y los gates degradan a legacy; con `flags`
 * hay catálogo y todo flag no listado queda apagado.
 * @param {{ workspaceId?: string, flags?: Record<string, boolean> }} [opts]
 */
export async function mockAuthenticatedSession(page, { workspaceId = E2E_WORKSPACE_ID, flags } = {}) {
  await page.route("**/api/v1/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        user: { id: E2E_USER_ID, email: "e2e@test.local" },
        workspace_activo: { id: workspaceId, tipo: "personal" },
        workspace_activo_id: workspaceId,
        ...(flags ? { flags, flags_status: "ok" } : {}),
      }),
    });
  });
}

/**
 * Siembra el blob CRM en la clave por workspace (esquema 2 de localStorage).
 * El workspace debe coincidir con `workspace_activo_id` de la sesión mock; si no,
 * la app cambia de workspace al hidratar y carga un blob vacío.
 * @param {import("@playwright/test").Page} page
 * @param {Partial<AppDatabase>} [overrides]
 * @param {{ workspaceId?: string }} [opts]
 */
export async function seedLocalDatabase(page, overrides = {}, { workspaceId = E2E_WORKSPACE_ID } = {}) {
  await page.addInitScript(({ db, ws, userId }) => {
    if (sessionStorage.getItem("e2e-db-seeded") === "1") return;
    localStorage.setItem("sts4_schema", "2");
    localStorage.setItem("sts4_active_workspace", ws);
    localStorage.setItem(`sts4_v1:${ws}`, JSON.stringify(db));
    localStorage.setItem("sts4_account", userId);
    sessionStorage.setItem("e2e-db-seeded", "1");
  }, {
    db: buildSeedDatabase(overrides),
    ws: workspaceId,
    userId: E2E_USER_ID,
  });
}

/**
 * Prepara página autenticada con datos locales.
 * @param {import("@playwright/test").Page} page
 * @param {Partial<AppDatabase>} [overrides]
 * @param {{ workspaceId?: string, flags?: Record<string, boolean> }} [opts]
 */
export async function prepareAuthenticatedPage(page, overrides = {}, opts = {}) {
  await mockAuthenticatedSession(page, opts);
  await seedLocalDatabase(page, overrides, opts);
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
 * Lee el blob CRM del workspace activo (`sts4_v1:{workspaceId}`).
 * @param {import("@playwright/test").Page} page
 */
export async function readStoredDb(page) {
  return page.evaluate(() => {
    const ws = localStorage.getItem("sts4_active_workspace");
    const raw = ws ? localStorage.getItem(`sts4_v1:${ws}`) : null;
    return raw ? JSON.parse(raw) : null;
  });
}

/**
 * @param {import("@playwright/test").Page} page
 */
export async function readStoredClient(page, clientId = E2E_CLIENT_ID) {
  const db = await readStoredDb(page);
  return db?.clients?.[clientId] ?? null;
}
