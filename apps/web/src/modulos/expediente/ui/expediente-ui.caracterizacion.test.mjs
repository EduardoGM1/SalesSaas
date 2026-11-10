/**
 * Caracterización de la UI de expediente antes de moverla.
 * Rutas, exports y el filtro de pins siguen iguales después del move.
 * OPC no se mueve.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ROOT = resolve(WEB, "../../..");

function first(paths) {
  for (const p of paths) if (existsSync(p)) return p;
  throw new Error(`no está: ${paths.join(" | ")}`);
}

function read(paths) {
  return readFileSync(first(paths), "utf8");
}

test("rutas de expediente y de OPC no cambian", () => {
  const routes = readFileSync(resolve(WEB, "routes/index.jsx"), "utf8");
  for (const path of [
    'path="clients"',
    'path="clients/opc-nuevo"',
    'path="clients/:id"',
    'path="/share/:token"',
    'path="/e/i/:token"',
    'path="/e/:prospectId"',
    'path="red/contacto/:contactId/expediente/:prospectId"',
  ]) {
    assert.ok(routes.includes(path), path);
  }
});

test("lazy de lista y ficha; OPC sigue en components", () => {
  const lazy = readFileSync(resolve(WEB, "routes/lazy-pages.js"), "utf8");
  assert.match(lazy, /namedLazy\(\(\) => import\([^)]+\), "ClientsPage"\)/);
  assert.match(lazy, /namedLazy\(\(\) => import\([^)]+\), "ClientDetail"\)/);
  assert.match(lazy, /opc-expediente-page\.jsx"\), "OpcExpedientePage"/);
  assert.ok(existsSync(resolve(WEB, "components/clients/opc-expediente-page.jsx")));
});

test("acciones de expediente conservan los cuatro exports", () => {
  const src = read([
    resolve(WEB, "modulos/expediente/servicios/acciones-expediente.js"),
    resolve(WEB, "actions/clients.js"),
  ]);
  for (const name of [
    "filterAndSortClients",
    "createProspectFromName",
    "saveClientEdit",
    "deleteClientWithConfirm",
  ]) {
    assert.match(src, new RegExp(`export (async )?function ${name}\\b`));
  }
});

test("lista de expedientes filtra el pin por id", () => {
  const src = read([
    resolve(WEB, "modulos/expediente/ui/clients-page.jsx"),
    resolve(WEB, "components/clients/clients-page.jsx"),
  ]);
  assert.match(src, /export function ClientsPage\(/);
  assert.match(src, /filter:\s*`id=eq\.\$\{id\}`/);
});

test("ficha exporta ClientDetail y la página de enlace sigue existiendo", () => {
  const detail = read([
    resolve(WEB, "modulos/expediente/ui/client-detail.jsx"),
    resolve(WEB, "components/clients/client-detail.jsx"),
  ]);
  assert.match(detail, /export function ClientDetail\(/);
  const link = read([
    resolve(WEB, "modulos/expediente/ui/ExpedienteLinkPage.jsx"),
    resolve(WEB, "pages/ExpedienteLinkPage.jsx"),
  ]);
  assert.match(link, /export function ExpedienteLinkPage\(/);
  assert.equal(ROOT.includes("sales-app"), true);
});
