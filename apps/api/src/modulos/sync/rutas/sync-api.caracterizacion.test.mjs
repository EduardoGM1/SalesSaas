/**
 * Caracterización de la API sync: paths y códigos, sin tocar shared ni claves.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const routeFile = [
  "src/modulos/sync/rutas/sync.js",
  "src/routes/sync.js",
].map((rel) => resolve(root, rel)).find((file) => existsSync(file));

test("rutas sync conservan paths y wrap", () => {
  assert.ok(routeFile, "falta el archivo de rutas");
  const src = readFileSync(routeFile, "utf8");
  assert.match(src, /router\.get\("\/sync"/);
  assert.match(src, /router\.put\("\/sync"/);
  assert.match(src, /wrap:\s*"sync"/);
  assert.match(src, /x-sync-protocol/);
  assert.match(src, /syncedAt/);
});

test("servicio sync conserva el mensaje de partial", () => {
  const serviceFile = [
    "src/modulos/sync/servicios/sync-service.js",
    "src/services/sync-service.js",
  ].map((rel) => resolve(root, rel)).find((file) => existsSync(file));
  assert.ok(serviceFile, "falta el servicio");
  const src = readFileSync(serviceFile, "utf8");
  assert.match(
    src,
    /Algunos cambios no se pudieron sincronizar; se reintentará\./,
  );
  assert.match(src, /SYNC_PARTIAL_MESSAGE/);
  assert.match(src, /@salesapp\/shared\/data\/sync\.js/);
});
