/**
 * Caracterización de las rutas de Royal Holiday, antes de mover la UI.
 * Paths y nombres lazy. OPC sigue exportándose como OpcExpedientePage.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, "../../..");
const routes = readFileSync(resolve(WEB, "routes/index.jsx"), "utf8");
const lazy = readFileSync(resolve(WEB, "routes/lazy-pages.js"), "utf8");

const PATHS = [
  'path="clients/opc-nuevo"',
  'path="tools/rh/bottom-lines"',
  'path="tools/rh/comisiones"',
  'path="tools/rh/creditos"',
  'path="tools/rh/calendario-comisiones"',
  'path="tools/rh/dias-descanso"',
  'path="ops/rh"',
  'path="ops/rh/premanifiesto"',
  'path="ops/rh/linea"',
  'path="ops/rh/resumen"',
  'path="ops/rh/estadisticos"',
  'path="ops/rh/okr"',
  'path="ops/rh/calendario-descansos"',
  'path="ops/rh/propinas"',
];

const NAMES = [
  "RhBottomLinesPage",
  "RhComisionesPage",
  "RhCreditosPage",
  "RhCalendarioComisionesPage",
  "RhDiasDescansoPage",
  "RhOpsHubPage",
  "RhPremanifiestoPage",
  "RhLineaPage",
  "RhResumenOpsPage",
  "RhEstadisticosPage",
  "RhOkrPage",
  "RhCalendarioDescansosPage",
  "RhPropinasPage",
];

test("las rutas de Royal Holiday y OPC no cambian", () => {
  for (const path of PATHS) assert.equal(routes.includes(path), true, path);
});

test("los lazy conservan el nombre exportado", () => {
  for (const name of NAMES) {
    assert.match(lazy, new RegExp(`namedLazy\\([^\\n]+, "${name}"\\)`));
  }
  assert.match(lazy, /opc-expediente-page\.jsx"\), "OpcExpedientePage"/);
});

test("las páginas de ops existen en el módulo o en el legado", () => {
  const moved = resolve(HERE, "RhOpsHubPage.jsx");
  const legacy = resolve(WEB, "pages/rh/RhOpsHubPage.jsx");
  assert.equal(existsSync(moved) || existsSync(legacy), true);
  assert.equal(existsSync(resolve(WEB, "components/clients/opc-expediente-page.jsx")), true);
});
