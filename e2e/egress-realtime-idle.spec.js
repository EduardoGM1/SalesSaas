import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  EGRESS_REALTIME_IDLE_MS,
  E2E_EMAIL,
  E2E_PASSWORD,
  hasEgressCredentials,
  loginApi,
} from "./helpers/egress.js";

const root = process.cwd();

test.describe("Egress — Realtime (estático)", () => {
  test("dashboard no dispara GET /sync ante postgres_changes", () => {
    const src = fs.readFileSync(
      path.join(root, "apps/web/src/lib/dashboard-data-realtime.js"),
      "utf8",
    );
    expect(src).not.toMatch(/requestSyncRefresh/);
    expect(src).toMatch(/applyDashboardTableChange/);
  });

  test("un cambio de tabla no referencia las otras 5 rutas REST", () => {
    const src = fs.readFileSync(
      path.join(root, "apps/web/src/lib/sync-table-refresh.js"),
      "utf8",
    );
    expect(src).toMatch(/export const TABLE_REST_PATHS/);
    expect(src).toMatch(/restPathsNotForTable/);
    expect(src).not.toMatch(/\/api\/v1\/sync/);
  });
});

test.describe("Egress — Realtime en inactividad", () => {
  test.skip(!hasEgressCredentials(), "Define E2E_EMAIL y E2E_PASSWORD.");

  test("en 60s sin cambios del usuario, mensajes Realtime deben ser ~0", async ({ page }) => {
    test.setTimeout(EGRESS_REALTIME_IDLE_MS + 45_000);

    const frames = [];
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    cdp.on("Network.webSocketFrameReceived", (event) => {
      const payload = event.response?.payloadData;
      if (typeof payload !== "string" || payload.length === 0) return;
      if (payload === "[]" || payload === "{}") return;
      frames.push({
        at: Date.now(),
        bytes: Buffer.byteLength(payload, "utf8"),
        preview: payload.slice(0, 160),
      });
    });

    await page.goto("/login");
    await page.locator('input[name="email"]').fill(E2E_EMAIL);
    await page.locator('input[name="password"]').fill(E2E_PASSWORD);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });

    await page.waitForTimeout(8_000);
    const afterSubscribe = Date.now();
    frames.length = 0;

    await page.waitForTimeout(EGRESS_REALTIME_IDLE_MS);

    const idleFrames = frames.filter((f) => f.at >= afterSubscribe);
    const idleBytes = idleFrames.reduce((sum, f) => sum + f.bytes, 0);
    const fatFrames = idleFrames.filter((f) => f.bytes > 80);
    expect(
      fatFrames.length,
      `Realtime ruidoso en idle: ${fatFrames.length} frames >80 B, ${idleBytes} bytes totales. Ej: ${fatFrames[0]?.preview || "—"}`,
    ).toBeLessThanOrEqual(2);
  });

  test("un cambio en calendar_entries no pide /sync ni las otras tablas", async ({ page, request }) => {
    test.setTimeout(60_000);
    const login = await loginApi(request);
    expect(login.ok()).toBeTruthy();

    const hits = [];
    page.on("request", (req) => {
      const url = req.url();
      if (!url.includes("/api/v1/")) return;
      hits.push({ method: req.method(), url });
    });

    await page.goto("/login");
    await page.locator('input[name="email"]').fill(E2E_EMAIL);
    await page.locator('input[name="password"]').fill(E2E_PASSWORD);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
    await page.waitForTimeout(8_000);

    const before = hits.length;
    const created = await request.post("/api/v1/calendar-entries", {
      data: {
        type: "nota",
        t: "nota",
        entry_date: "2099-01-01",
        date: "2099-01-01",
        note: "e2e-egress-probe",
      },
    });
    test.skip(!created.ok(), `no se pudo crear probe calendar (${created.status()})`);
    const body = await created.json().catch(() => ({}));
    const id = body.data?.id;
    await page.waitForTimeout(2500);

    const after = hits.slice(before);
    const getPaths = after
      .filter((h) => h.method === "GET")
      .map((h) => {
        try {
          return new URL(h.url).pathname;
        } catch {
          return h.url;
        }
      });

    expect(getPaths.filter((p) => p === "/api/v1/sync")).toEqual([]);
    expect(getPaths.filter((p) => p === "/api/v1/prospects")).toEqual([]);
    expect(getPaths.filter((p) => p === "/api/v1/sales")).toEqual([]);
    expect(getPaths.filter((p) => p === "/api/v1/activities")).toEqual([]);
    expect(getPaths.filter((p) => p === "/api/v1/goals")).toEqual([]);
    expect(getPaths.filter((p) => p.startsWith("/api/v1/tool-calculations"))).toEqual([]);

    if (id) {
      await request.delete(`/api/v1/calendar-entries/${id}`);
    }
  });
});
