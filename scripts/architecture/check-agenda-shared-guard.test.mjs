/**
 * Prueba del guard: debe detectar toques a shared/sync y permitir agenda/docs.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findForbidden,
  isAgendaBranch,
  isForbiddenPath,
} from "./check-agenda-shared-guard.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("isAgendaBranch solo arquitectura/agenda-*", () => {
  assert.equal(isAgendaBranch("arquitectura/agenda-tramo-b"), true);
  assert.equal(isAgendaBranch("arquitectura/agenda-inventario"), true);
  assert.equal(isAgendaBranch("refs/heads/arquitectura/agenda-x"), true);
  assert.equal(isAgendaBranch("main"), false);
  assert.equal(isAgendaBranch("arquitectura/modulo-metas"), false);
});

test("isForbiddenPath cubre sync.js, manifiesto y todo data/", () => {
  assert.equal(isForbiddenPath("packages/shared/src/data/sync.js"), true);
  assert.equal(isForbiddenPath("scripts/architecture/sync-shared-files.json"), true);
  assert.equal(isForbiddenPath("packages/shared/src/data/mappers.js"), true);
  assert.equal(isForbiddenPath("packages/shared/src/data/sync-columns.js"), true);
  assert.equal(isForbiddenPath("apps/web/src/modulos/agenda/index.ts"), false);
});

test("findForbidden falla si el diff toca shared data", () => {
  const hit = findForbidden([
    "apps/web/src/modulos/agenda/dominio/calendar-descansos.js",
    "packages/shared/src/data/sync.js",
    "docs/PROYECTO.md",
  ]);
  assert.deepEqual(hit, ["packages/shared/src/data/sync.js"]);
});

test("CLI --self-test exit 0 (incluye caso que fallaría en diff real)", () => {
  execSync("node scripts/architecture/check-agenda-shared-guard.mjs --self-test", {
    cwd: ROOT,
    stdio: "pipe",
  });
});
