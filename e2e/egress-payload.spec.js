import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  EGRESS_EXPECT_MIN_ROWS,
  MAX_BYTES_PER_ROW,
  MAX_SYNC_BYTES_PER_CLIENT,
  hasEgressCredentials,
  loginApi,
  measureGet,
} from "./helpers/egress.js";

const root = process.cwd();

test.describe("Egress — columnas de sync (estático)", () => {
  test("SYNC_SELECT no usa asterisco y tool_calculations omite data", () => {
    const src = fs.readFileSync(
      path.join(root, "packages/shared/src/data/sync-columns.js"),
      "utf8",
    );
    expect(src).toMatch(/prospects:\s*\n?\s*"id,user_id/);
    expect(src).not.toMatch(/prospects:\s*"\*"/);
    expect(src).not.toMatch(/sales:\s*"\*"/);
    expect(src).toMatch(/tool_calculations:\s*\n?\s*"id,user_id,workspace_id,prospect_id,tool,updated_at"/);
    expect(src).not.toMatch(/tool_calculations:\s*\n?\s*"id,user_id,workspace_id,prospect_id,tool,data,updated_at"/);
  });
});

test.describe("Egress — peso de respuestas REST", () => {
  test.skip(!hasEgressCredentials(), "Define E2E_EMAIL y E2E_PASSWORD para medir payloads reales.");

  test.beforeEach(async ({ request }) => {
    const login = await loginApi(request);
    expect(login.ok(), `login ${login.status()}`).toBeTruthy();
  });

  test("GET /prospects, /sales, /calendar-entries y /sync no superan umbral por fila", async ({ request }) => {
    const prospects = await measureGet(request, "/api/v1/prospects?limit=100&offset=0");
    const sales = await measureGet(request, "/api/v1/sales?limit=100&offset=0");
    const calendar = await measureGet(request, "/api/v1/calendar-entries?limit=100&offset=0");
    const sync = await measureGet(request, "/api/v1/sync");

    for (const row of [prospects, sales, calendar, sync]) {
      expect(row.ok, `${row.path} → ${row.status}`).toBeTruthy();
    }

    expect(prospects.rows, "dataset de prospects insuficiente (objetivo ~100)").toBeGreaterThanOrEqual(
      Math.min(EGRESS_EXPECT_MIN_ROWS, 1),
    );

    expect(prospects.bytesPerRow, `prospects ${prospects.bytesPerRow} B/fila`).toBeLessThanOrEqual(
      MAX_BYTES_PER_ROW.prospects,
    );
    expect(sales.bytesPerRow, `sales ${sales.bytesPerRow} B/fila`).toBeLessThanOrEqual(
      MAX_BYTES_PER_ROW.sales,
    );
    expect(calendar.bytesPerRow, `calendar ${calendar.bytesPerRow} B/fila`).toBeLessThanOrEqual(
      MAX_BYTES_PER_ROW["calendar-entries"],
    );
    if (sync.rows > 0) {
      expect(sync.bytesPerRow, `sync ${sync.bytesPerRow} B/expediente`).toBeLessThanOrEqual(
        MAX_SYNC_BYTES_PER_CLIENT,
      );
      const clients = sync.json?.data?.clients || {};
      for (const client of Object.values(clients)) {
        for (const tool of ["survey", "vacaciones", "worksheet"]) {
          const bucket = client?.data?.[tool];
          if (!bucket || typeof bucket !== "object") continue;
          const realKeys = Object.keys(bucket).filter((k) => !k.startsWith("_"));
          expect(realKeys, `sync no debe incluir JSON de ${tool}`).toEqual([]);
        }
      }
    }
  });

  test("GET /tool-calculations (un snapshot) no supera umbral de JSON", async ({ request }) => {
    const prospects = await measureGet(request, "/api/v1/prospects?limit=20&offset=0");
    expect(prospects.ok).toBeTruthy();
    const first = Array.isArray(prospects.json?.data) ? prospects.json.data[0] : null;
    test.skip(!first?.id, "No hay prospects para pedir un snapshot de tool.");

    const tool = await measureGet(
      request,
      `/api/v1/tool-calculations?tool=worksheet&prospect_id=${first.id}`,
    );
    expect(tool.status, "200 o vacío").toBeLessThan(500);
    if (tool.ok && tool.json?.data) {
      expect(tool.bytes).toBeLessThanOrEqual(MAX_BYTES_PER_ROW["tool-calculations"]);
    }
  });
});
