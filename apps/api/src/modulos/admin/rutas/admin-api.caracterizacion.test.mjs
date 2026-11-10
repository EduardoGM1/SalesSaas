/**
 * Caracterización de la API admin: paths y códigos, sin tocar shared auth.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const routeFile = [
  "src/modulos/admin/rutas/admin.js",
  "src/routes/admin.js",
].map((rel) => resolve(root, rel)).find((file) => existsSync(file));

const helpersFile = [
  "src/modulos/admin/rutas/admin-helpers.js",
  "src/routes/admin-helpers.js",
].map((rel) => resolve(root, rel)).find((file) => existsSync(file));

const authFile = [
  "src/modulos/admin/middleware/admin-auth.js",
  "src/middleware/admin-auth.js",
].map((rel) => resolve(root, rel)).find((file) => existsSync(file));

test("rutas admin conservan paths clave", () => {
  assert.ok(routeFile, "falta el archivo de rutas admin");
  const src = readFileSync(routeFile, "utf8");
  for (const path of [
    'router.get("/me"',
    'router.get("/roles"',
    'router.get("/tenant/context"',
    'router.get("/users"',
    'router.patch("/users/:id/role"',
    'router.get("/support/requests"',
    'router.get("/permissions-catalog"',
    'router.get("/logs"',
    'router.get("/overview"',
  ]) {
    assert.match(src, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("guards admin conservan mensajes 403", () => {
  assert.ok(helpersFile, "falta admin-helpers");
  assert.ok(authFile, "falta admin-auth");
  const helpers = readFileSync(helpersFile, "utf8");
  const auth = readFileSync(authFile, "utf8");
  assert.match(helpers, /No autorizado\./);
  assert.match(auth, /No autorizado\./);
  assert.match(auth, /No tienes permiso para esta acción\./);
});

test("v1 monta /admin", () => {
  const v1 = readFileSync(resolve(root, "src/routes/v1.js"), "utf8");
  assert.match(v1, /router\.use\("\/admin"/);
  assert.match(v1, /adminRouter|from ["'].*admin/);
});
