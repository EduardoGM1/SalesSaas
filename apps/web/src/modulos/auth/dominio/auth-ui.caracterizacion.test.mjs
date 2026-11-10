/**
 * Caracterización web auth: rutas SPA y clave sts4_auth_sync.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const routes = resolve(root, "src/routes/index.jsx");
const sessionApi = [
  "src/modulos/auth/servicios/session-api.js",
  "src/lib/session-api.js",
].map((rel) => resolve(root, rel)).find((f) => existsSync(f));
const keys = resolve(root, "src/lib/storage/keys.ts");

test("SPA conserva rutas auth", () => {
  const src = readFileSync(routes, "utf8");
  for (const p of [
    'path="/login"',
    'path="/register"',
    'path="/forgot-password"',
    'path="/reset-password"',
    'path="/auth/callback"',
  ]) {
    assert.match(src, new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("sts4_auth_sync se conserva en sesión y keep-on-logout", () => {
  assert.ok(sessionApi, "falta session-api");
  const session = readFileSync(sessionApi, "utf8");
  const storage = readFileSync(keys, "utf8");
  assert.match(session, /sts4_auth_sync/);
  assert.match(storage, /sts4_auth_sync/);
});
