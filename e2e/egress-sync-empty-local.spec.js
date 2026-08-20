import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  E2E_EMAIL,
  E2E_PASSWORD,
  hasEgressCredentials,
} from "./helpers/egress.js";

const root = process.cwd();

test.describe("Egress — dispositivo con local vacío (estático)", () => {
  test("init omite recovery/GET extra si el blob local estaba vacío", () => {
    const provider = fs.readFileSync(
      path.join(root, "apps/web/src/components/providers/sync-provider.jsx"),
      "utf8",
    );
    const recover = fs.readFileSync(
      path.join(root, "apps/web/src/lib/recover-local-prospects.js"),
      "utf8",
    );
    expect(provider).toMatch(/hadLocalToRecover/);
    expect(provider).toMatch(/if \(hadLocalToRecover\)/);
    expect(provider).toMatch(/runLocalRecovery\(\{ force: true, reason: "init", cloudDb \}\)/);
    expect(recover).toMatch(/opts\.cloudDb/);
    expect(recover).toMatch(/alreadyHadCloud/);
  });
});

test.describe("Egress — dispositivo con local vacío", () => {
  test.skip(!hasEgressCredentials(), "Define E2E_EMAIL y E2E_PASSWORD.");

  test("GET /api/v1/sync responde 200 en un solo intento, sin timeouts", async ({ page }) => {
    test.setTimeout(60_000);

    const syncCalls = [];
    page.on("request", (req) => {
      const url = req.url();
      if (!url.includes("/api/v1/sync")) return;
      syncCalls.push({
        method: req.method(),
        startedAt: Date.now(),
      });
    });
    page.on("response", async (res) => {
      const url = res.url();
      if (!url.includes("/api/v1/sync")) return;
      const started = [...syncCalls].reverse().find((c) => !c.status && c.method === res.request().method());
      if (started) {
        started.status = res.status();
        started.ms = Date.now() - started.startedAt;
      }
    });

    await page.addInitScript(() => {
      try {
        localStorage.removeItem("sts4_v1");
        localStorage.removeItem("sts4_account");
        sessionStorage.clear();
      } catch {
        /* ignore */
      }
    });

    await page.goto("/login");
    await page.locator('input[name="email"]').fill(E2E_EMAIL);
    await page.locator('input[name="password"]').fill(E2E_PASSWORD);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });

    await page.waitForTimeout(12_000);

    const gets = syncCalls.filter((c) => c.method === "GET");
    const puts = syncCalls.filter((c) => c.method === "PUT");
    const failed = syncCalls.filter((c) => c.status && c.status >= 400);
    const timedOut = syncCalls.filter((c) => c.ms && c.ms >= 25_000);

    expect(failed, `fallos /sync: ${JSON.stringify(failed)}`).toHaveLength(0);
    expect(timedOut, `timeouts /sync: ${JSON.stringify(timedOut)}`).toHaveLength(0);
    expect(gets.length, `GET /sync count=${gets.length} (contrato: 1 intento)`).toBe(1);
    expect(gets[0]?.status).toBe(200);
    expect(puts.filter((p) => p.status && p.status >= 400)).toHaveLength(0);
  });
});
