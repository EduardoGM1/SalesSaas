/**
 * Caracterización UI Admin: rutas y nombres lazy, sin cambiar paths.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const routes = resolve(root, "src/routes/index.jsx");
const lazy = resolve(root, "src/routes/lazy-pages.js");

test("rutas admin conservan paths", () => {
  const src = readFileSync(routes, "utf8");
  for (const path of [
    'path="admin"',
    'path="users"',
    'path="roles"',
    'path="modules"',
    'path="empresas"',
    'path="logs"',
    'path="goals"',
    'path="tools"',
    'path="support"',
  ]) {
    assert.match(src, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("lazy admin apunta al módulo o a pages/admin", () => {
  const src = readFileSync(lazy, "utf8");
  const names = [
    "AdminOverviewPage",
    "AdminUsersPage",
    "AdminGoalsPage",
    "AdminToolsUsagePage",
    "AdminSupportPage",
    "AdminRolesPage",
    "AdminModulesPage",
    "AdminEmpresasPage",
    "AdminLogsPage",
  ];
  for (const name of names) {
    assert.match(src, new RegExp(`"${name}"`));
  }
  const moduleLazy = /modulos\/admin\/paginas\.js"\),\s*"AdminOverviewPage"/;
  const legacyLazy = /pages\/admin\/AdminOverviewPage\.jsx"\),\s*"AdminOverviewPage"/;
  assert.ok(moduleLazy.test(src) || legacyLazy.test(src), "lazy Overview admin");
});

test("páginas admin existen en ui/ o pages/admin", () => {
  for (const name of [
    "AdminOverviewPage.jsx",
    "AdminUsersPage.jsx",
    "AdminRolesPage.jsx",
    "AdminEmpresasPage.jsx",
  ]) {
    const moved = resolve(root, "src/modulos/admin/ui", name);
    const legacy = resolve(root, "src/pages/admin", name);
    assert.ok(existsSync(moved) || existsSync(legacy), name);
  }
});
