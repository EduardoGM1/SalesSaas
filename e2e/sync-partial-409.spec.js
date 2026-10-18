/**
 * Cliente desplegado (sin X-Sync-Protocol: 2) frente al 409 sync_partial del PUT /sync.
 * Ejecuta el SyncProvider real: ante el 409 conserva el blob local y el outbox,
 * y al recargar reintenta. El contraste muestra por qué un 200 parcial sería dañino.
 */
import { test, expect } from "@playwright/test";
import {
  E2E_WORKSPACE_ID,
  prepareAuthenticatedPage,
  readStoredDb,
} from "./helpers/seed-local-db.js";

const EMPTY_CLOUD = { clients: {}, sales: {}, libre: {}, cal: {}, goals: {}, userActivities: [], settings: {} };
const LOCAL_NAME = "EduardoTest";

/** @param {import("@playwright/test").Page} page */
async function mockSync(page, putResponse) {
  const puts = [];
  await page.route("**/api/v1/sync", async (route) => {
    const req = route.request();
    if (req.method() === "PUT") {
      puts.push({ protocol: req.headers()["x-sync-protocol"] ?? null, body: req.postDataJSON() });
      await route.fulfill(putResponse());
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: EMPTY_CLOUD, syncedAt: new Date().toISOString() }),
    });
  });
  await page.route("**/api/v1/prospects**", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "e2e" }) }),
  );
  return puts;
}

const storedNames = async (page) => Object.values((await readStoredDb(page))?.clients || {}).map((c) => c.name);

const outbox = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null"), `sts4_outbound_v1:${E2E_WORKSPACE_ID}`);

test("409 sync_partial: conserva datos locales y outbox, y reintenta al recargar", async ({ page }) => {
  await prepareAuthenticatedPage(page);
  const puts = await mockSync(page, () => ({
    status: 409,
    contentType: "application/json",
    body: JSON.stringify({
      error: "Algunos cambios no se pudieron sincronizar; se reintentará.",
      code: "sync_partial",
      rejected_counts: { rls_insert: 1 },
      rejected: [{ table: "prospects", id: "x", code: "rls_insert" }],
    }),
  }));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect.poll(() => puts.length, { timeout: 20_000 }).toBeGreaterThan(0);
  expect(puts[0].protocol).toBeNull();
  expect(Object.values(puts[0].body.data.clients).map((c) => c.name)).toContain(LOCAL_NAME);

  await expect.poll(async () => (await outbox(page))?.dirty, { timeout: 10_000 }).toBe(true);
  expect(await storedNames(page)).toContain(LOCAL_NAME);

  const before = puts.length;
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(() => puts.length, { timeout: 20_000 }).toBeGreaterThan(before);
  expect(Object.values(puts.at(-1).body.data.clients).map((c) => c.name)).toContain(LOCAL_NAME);
  await expect.poll(async () => (await outbox(page))?.dirty, { timeout: 10_000 }).toBe(true);
  expect(await storedNames(page)).toContain(LOCAL_NAME);
});

test("contraste: un 200 sin la fila rechazada reemplazaría la base local", async ({ page }) => {
  await prepareAuthenticatedPage(page);
  const puts = await mockSync(page, () => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: EMPTY_CLOUD, syncedAt: new Date().toISOString() }),
  }));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect.poll(() => puts.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await expect.poll(() => storedNames(page), { timeout: 10_000 }).not.toContain(LOCAL_NAME);
});
