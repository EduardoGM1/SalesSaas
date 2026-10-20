/**
 * Prueba del guard de ventas: sync, shared data, db-store y outbox.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findForbidden,
  isForbiddenPath,
  isVentasBranch,
} from "./check-ventas-shared-guard.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("isVentasBranch solo arquitectura/ventas-*", () => {
  assert.equal(isVentasBranch("arquitectura/ventas-tramo-b"), true);
  assert.equal(isVentasBranch("arquitectura/ventas-inventario"), true);
  assert.equal(isVentasBranch("refs/heads/arquitectura/ventas-x"), true);
  assert.equal(isVentasBranch("main"), false);
  assert.equal(isVentasBranch("arquitectura/agenda-tramo-b"), false);
});

test("isForbiddenPath cubre sync, data, db-store y outbox", () => {
  assert.equal(isForbiddenPath("packages/shared/src/data/sync.js"), true);
  assert.equal(isForbiddenPath("scripts/architecture/sync-shared-files.json"), true);
  assert.equal(isForbiddenPath("packages/shared/src/data/mappers.js"), true);
  assert.equal(isForbiddenPath("apps/web/src/stores/db-store.ts"), true);
  assert.equal(isForbiddenPath("apps/web/src/lib/sync-outbox.js"), true);
  assert.equal(isForbiddenPath("apps/web/src/modulos/ventas/index.ts"), false);
  assert.equal(isForbiddenPath("apps/web/src/lib/sales/snapshot.ts"), false);
});

test("findForbidden falla si el diff toca db-store u outbox", () => {
  const hit = findForbidden([
    "apps/web/src/modulos/ventas/dominio/contabilidad-ventas.ts",
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
  execSync("node scripts/architecture/check-ventas-shared-guard.mjs --self-test", {
    cwd: ROOT,
    stdio: "pipe",
  });
});
