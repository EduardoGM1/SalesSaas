import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findForbidden, isAdminBranch, isForbiddenPath } from "./check-admin-shared-guard.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = resolve(dirname(fileURLToPath(import.meta.url)), "check-admin-shared-guard.mjs");

test("isAdminBranch solo arquitectura/admin-*", () => {
  assert.equal(isAdminBranch("arquitectura/admin-tramo-a"), true);
  assert.equal(isAdminBranch("main"), false);
});

test("isForbiddenPath cubre auth shared, sync y db-store", () => {
  assert.equal(isForbiddenPath("packages/shared/src/auth/permissions.js"), true);
  assert.equal(isForbiddenPath("packages/shared/src/data/sync.js"), true);
  assert.equal(isForbiddenPath("apps/web/src/stores/db-store.ts"), true);
  assert.equal(isForbiddenPath("apps/web/src/modulos/admin/ui/AdminUsersPage.jsx"), false);
});

test("findForbidden falla si el diff toca permissions", () => {
  assert.deepEqual(findForbidden(["packages/shared/src/auth/permissions.js"]), [
    "packages/shared/src/auth/permissions.js",
  ]);
});

test("CLI --self-test exit 0", () => {
  const r = spawnSync(process.execPath, [CLI, "--self-test"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});
