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

test("supabase browser vive en modulos/auth con shims legacy", () => {
  const client = resolve(root, "src/modulos/auth/servicios/supabase/client.ts");
  const config = resolve(root, "src/modulos/auth/servicios/supabase/config.ts");
  const ensure = resolve(root, "src/modulos/auth/servicios/supabase/ensure-browser-session.js");
  assert.ok(existsSync(client), "falta supabase/client.ts");
  assert.ok(existsSync(config), "falta supabase/config.ts");
  assert.ok(existsSync(ensure), "falta supabase/ensure-browser-session.js");

  const shimClient = readFileSync(resolve(root, "src/lib/supabase/client.ts"), "utf8");
  const shimConfig = readFileSync(resolve(root, "src/lib/supabase/config.ts"), "utf8");
  const shimEnsure = readFileSync(resolve(root, "src/lib/supabase/ensure-browser-session.js"), "utf8");
  assert.match(shimClient, /modulos\/auth\/servicios\/supabase\/client/);
  assert.match(shimConfig, /modulos\/auth\/servicios\/supabase\/config/);
  assert.match(shimEnsure, /modulos\/auth\/servicios\/supabase\/ensure-browser-session/);

  const clientSrc = readFileSync(client, "utf8");
  assert.match(clientSrc, /createBrowserClient/);
  assert.match(clientSrc, /export function createClient/);
});

test("OneSignal/push viven en modulos/auth con shims legacy", () => {
  const onesignal = resolve(root, "src/modulos/auth/servicios/onesignal.js");
  const pushEnable = resolve(root, "src/modulos/auth/servicios/push-enable.js");
  const provider = resolve(root, "src/modulos/auth/ui/onesignal-provider.jsx");
  assert.ok(existsSync(onesignal), "falta servicios/onesignal.js");
  assert.ok(existsSync(pushEnable), "falta servicios/push-enable.js");
  assert.ok(existsSync(provider), "falta ui/onesignal-provider.jsx");

  const shimOs = readFileSync(resolve(root, "src/lib/onesignal.js"), "utf8");
  const shimPush = readFileSync(resolve(root, "src/lib/push-enable.js"), "utf8");
  const shimProv = readFileSync(resolve(root, "src/components/providers/onesignal-provider.jsx"), "utf8");
  assert.match(shimOs, /modulos\/auth\/servicios\/onesignal/);
  assert.match(shimPush, /modulos\/auth\/servicios\/push-enable/);
  assert.match(shimProv, /modulos\/auth\/ui\/onesignal-provider/);

  const osSrc = readFileSync(onesignal, "utf8");
  assert.match(osSrc, /SDK_LOCAL_URL/);
  assert.match(osSrc, /ensureOneSignal|syncPushIdentityAndSubscription/);
});
