/**
 * Cliente Sync Tramo 2 (X-Sync-Protocol: 2) ante respuesta parcial del PUT /sync.
 * Ante 200 { partial, rejected } conserva filas locales rechazadas vía merge
 * y marca blocked/outbox según código. El contraste muestra por qué un 200
 * vacío sin merge borraría el expediente local.
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
/** @param {(body: any) => { status: number, contentType?: string, body: string }} putResponse */
async function mockSync(page, putResponse) {
  const puts = [];
  await page.route("**/api/v1/sync", async (route) => {
    const req = route.request();
    if (req.method() === "PUT") {
      const body = req.postDataJSON();
      puts.push({ protocol: req.headers()["x-sync-protocol"] ?? null, body });
      await route.fulfill(putResponse(body));
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

test("protocolo 2 partial permanente: conserva local y marca blocked", async ({ page }) => {
  await prepareAuthenticatedPage(page);
  const puts = await mockSync(page, (reqBody) => {
    const id = Object.keys(reqBody?.data?.clients || {})[0] || "x";
    return {
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: EMPTY_CLOUD,
        partial: true,
        rejected: [{ table: "prospects", id, code: "sin_permiso" }],
      }),
    };
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect.poll(() => puts.length, { timeout: 20_000 }).toBeGreaterThan(0);
  expect(puts[0].protocol).toBe("2");
  expect(Object.values(puts[0].body.data.clients).map((c) => c.name)).toContain(LOCAL_NAME);

  await expect.poll(async () => (await outbox(page))?.blocked?.length ?? 0, { timeout: 10_000 }).toBeGreaterThan(0);
  expect((await outbox(page))?.dirty).toBe(false);
  expect(await storedNames(page)).toContain(LOCAL_NAME);
});

test("protocolo 2 partial transient: conserva local y outbox dirty", async ({ page }) => {
  await prepareAuthenticatedPage(page);
  const puts = await mockSync(page, (reqBody) => {
    const id = Object.keys(reqBody?.data?.clients || {})[0] || "x";
    return {
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: EMPTY_CLOUD,
        partial: true,
        rejected: [{ table: "prospects", id, code: "rls_insert" }],
      }),
    };
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect.poll(() => puts.length, { timeout: 20_000 }).toBeGreaterThan(0);
  expect(puts[0].protocol).toBe("2");

  await expect.poll(async () => (await outbox(page))?.dirty, { timeout: 10_000 }).toBe(true);
  expect(await storedNames(page)).toContain(LOCAL_NAME);
  const box = await outbox(page);
  expect(box?.nextAttemptAt).toBeTruthy();
});

test("contraste: un 200 sin merge reemplazaría la base local", async ({ page }) => {
  await prepareAuthenticatedPage(page);
  const puts = await mockSync(page, () => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: EMPTY_CLOUD, syncedAt: new Date().toISOString() }),
  }));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect.poll(() => puts.length, { timeout: 20_000 }).toBeGreaterThan(0);
  expect(puts[0].protocol).toBe("2");
  await expect.poll(() => storedNames(page), { timeout: 10_000 }).not.toContain(LOCAL_NAME);
});
