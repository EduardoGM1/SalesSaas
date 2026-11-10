/**
 * Prueba del guard de expediente: sync, shared data, db-store y outbox.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findForbidden,
  isForbiddenPath,
  isExpedienteBranch,
} from "./check-expediente-shared-guard.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("isExpedienteBranch solo arquitectura/expediente-*", () => {
  assert.equal(isExpedienteBranch("arquitectura/expediente-tramo-b"), true);
  assert.equal(isExpedienteBranch("refs/heads/arquitectura/expediente-x"), true);
  assert.equal(isExpedienteBranch("main"), false);
  assert.equal(isExpedienteBranch("arquitectura/ventas-tramo-b"), false);
});

test("isForbiddenPath cubre sync, data, db-store y outbox", () => {
  assert.equal(isForbiddenPath("packages/shared/src/data/sync.js"), true);
  assert.equal(isForbiddenPath("scripts/architecture/sync-shared-files.json"), true);
  assert.equal(isForbiddenPath("packages/shared/src/data/mappers.js"), true);
  assert.equal(isForbiddenPath("apps/web/src/stores/db-store.ts"), true);
  assert.equal(isForbiddenPath("apps/web/src/lib/sync-outbox.js"), true);
  assert.equal(isForbiddenPath("apps/web/src/modulos/expediente/index.ts"), false);
  assert.equal(isForbiddenPath("apps/web/src/lib/clients.ts"), false);
});

test("findForbidden falla si el diff toca db-store u outbox", () => {
  const hit = findForbidden([
    "apps/web/src/modulos/expediente/dominio/identidad-prospecto.ts",
    "apps/web/src/stores/db-store.ts",
    "apps/web/src/lib/sync-outbox.js",
    "docs/PROYECTO.md",
  ]);
  assert.deepEqual(hit, [
    "apps/web/src/lib/sync-outbox.js",
    "apps/web/src/stores/db-store.ts",
  ]);
});

test("CLI --self-test exit 0", () => {
  execSync("node scripts/architecture/check-expediente-shared-guard.mjs --self-test", {
    cwd: ROOT,
    stdio: "pipe",
  });
});
