/**
 * Caracterización API auth: paths y rate limits, sin tocar cookies ni códigos.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

const authRoutes = [
  "src/modulos/auth/rutas/auth.js",
  "src/routes/auth.js",
].map((rel) => resolve(root, rel)).find((f) => existsSync(f));

const sessionRoutes = [
  "src/modulos/auth/rutas/session.js",
  "src/routes/session.js",
].map((rel) => resolve(root, rel)).find((f) => existsSync(f));

const limitsFile = [
  "src/modulos/auth/dominio/auth-rate-limits.js",
  "src/lib/auth-rate-limits.js",
].map((rel) => resolve(root, rel)).find((f) => existsSync(f));

test("app monta /auth", () => {
  const app = readFileSync(resolve(root, "src/app.js"), "utf8");
  assert.match(app, /app\.use\("\/auth"/);
});

test("rutas /auth conservan paths", () => {
  assert.ok(authRoutes, "falta routes/auth");
  const src = readFileSync(authRoutes, "utf8");
  for (const p of [
    '"/login"',
    '"/register"',
    '"/signout"',
    '"/forgot-password"',
    '"/reset-password"',
    '"/exchange-code"',
    '"/verify-token"',
    '"/set-session"',
    '"/callback"',
  ]) {
    assert.match(src, new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("rutas session conservan paths /api/v1/auth/*", () => {
  assert.ok(sessionRoutes, "falta routes/session");
  const src = readFileSync(sessionRoutes, "utf8");
  assert.match(src, /\/auth\/session/);
  assert.match(src, /\/auth\/workspace/);
  assert.match(src, /\/auth\/realtime-session/);
});

test("rate limits auth conservan cupos y mensaje", () => {
  assert.ok(limitsFile, "falta auth-rate-limits");
  const src = readFileSync(limitsFile, "utf8");
  assert.match(src, /Demasiados intentos\. Espera unos minutos e inténtalo de nuevo\./);
  assert.match(src, /max:\s*10/);
  assert.match(src, /max:\s*8/);
  assert.match(src, /max:\s*12/);
  assert.match(src, /max:\s*30/);
});

test("migración 0099 asigna liner de plataforma en handle_new_user", () => {
  const mig = resolve(root, "../../supabase/migrations/0099_default_role_liner_on_register.sql");
  assert.equal(existsSync(mig), true, mig);
  const src = readFileSync(mig, "utf8");
  assert.match(src, /handle_new_user/);
  assert.match(src, /slug = 'liner'/);
  assert.match(src, /empresa_id is null/);
  assert.match(src, /role_id/);
});

test("migración 0100 endurece ownership y unique prospect_code", () => {
  const mig = resolve(root, "../../supabase/migrations/0100_sync_tramo3_harden_ownership.sql");
  assert.equal(existsSync(mig), true, mig);
  const src = readFileSync(mig, "utf8");
  assert.match(src, /enforce_immutable_ownership/);
  assert.match(src, /prospects_user_ws_code_uniq/);
  assert.match(src, /salesapp\.allow_ownership_change/);
  assert.equal(/alter\s+table[\s\S]*workspace_id[\s\S]*set\s+default/i.test(src), false);
});
