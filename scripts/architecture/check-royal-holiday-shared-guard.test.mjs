/**
 * Prueba del guard de Royal Holiday: fórmulas, sync, db-store y outbox.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findForbidden,
  isForbiddenPath,
  isRoyalHolidayBranch,
} from "./check-royal-holiday-shared-guard.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("isRoyalHolidayBranch solo arquitectura/royal-holiday-*", () => {
  assert.equal(isRoyalHolidayBranch("arquitectura/royal-holiday-tramo-a"), true);
  assert.equal(isRoyalHolidayBranch("refs/heads/arquitectura/royal-holiday-x"), true);
  assert.equal(isRoyalHolidayBranch("main"), false);
  assert.equal(isRoyalHolidayBranch("arquitectura/expediente-tramo-c"), false);
});

test("isForbiddenPath cubre fórmulas, sync, data, db-store y outbox", () => {
  assert.equal(isForbiddenPath("packages/shared/src/calculations/royal-holiday.js"), true);
  assert.equal(isForbiddenPath("packages/shared/src/data/sync.js"), true);
  assert.equal(isForbiddenPath("scripts/architecture/sync-shared-files.json"), true);
  assert.equal(isForbiddenPath("apps/web/src/stores/db-store.ts"), true);
  assert.equal(isForbiddenPath("apps/web/src/lib/sync-outbox.js"), true);
  assert.equal(isForbiddenPath("apps/web/src/modulos/royal-holiday/cliente.js"), false);
});

test("findForbidden falla si el diff toca una fórmula", () => {
  const hit = findForbidden([
    "apps/web/src/modulos/royal-holiday/ui/RhOpsHubPage.jsx",
    "packages/shared/src/calculations/royal-holiday.js",
  ]);
  assert.deepEqual(hit, ["packages/shared/src/calculations/royal-holiday.js"]);
});

test("CLI --self-test exit 0", () => {
  execSync("node scripts/architecture/check-royal-holiday-shared-guard.mjs --self-test", {
    cwd: ROOT,
    stdio: "pipe",
  });
});
