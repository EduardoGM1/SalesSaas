import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findForbidden, isForbiddenPath, isSyncBranch } from "./check-sync-shared-guard.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = resolve(dirname(fileURLToPath(import.meta.url)), "check-sync-shared-guard.mjs");

test("isSyncBranch solo arquitectura/sync-*", () => {
  assert.equal(isSyncBranch("arquitectura/sync-tramo-c"), true);
  assert.equal(isSyncBranch("arquitectura/sync-tramo-a"), true);
  assert.equal(isSyncBranch("main"), false);
  assert.equal(isSyncBranch("arquitectura/royal-holiday-tramo-a"), false);
});

test("isForbiddenPath cubre shared data y db-store, no outbox", () => {
  assert.equal(isForbiddenPath("packages/shared/src/data/sync.js"), true);
  assert.equal(isForbiddenPath("packages/shared/src/data/mappers.js"), true);
  assert.equal(isForbiddenPath("scripts/architecture/sync-shared-files.json"), true);
  assert.equal(isForbiddenPath("apps/web/src/stores/db-store.ts"), true);
  assert.equal(isForbiddenPath("apps/web/src/lib/sync-outbox.js"), false);
  assert.equal(isForbiddenPath("apps/api/src/modulos/sync/servicios/sync-service.js"), false);
});

test("findForbidden falla si el diff toca shared data", () => {
  assert.deepEqual(findForbidden(["packages/shared/src/data/sync.js", "docs/x.md"]), [
    "packages/shared/src/data/sync.js",
  ]);
});

test("CLI --self-test exit 0", () => {
  const r = spawnSync(process.execPath, [CLI, "--self-test"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});
