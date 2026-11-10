/**
 * Caracterización de la API Royal Holiday: paths y códigos, sin tocar fórmulas.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const routeFile = [
  "src/modulos/royal-holiday/rutas/royal-holiday.js",
  "src/routes/royal-holiday.js",
].map((rel) => resolve(root, rel)).find((file) => existsSync(file));

test("rutas Royal Holiday conservan paths y códigos", () => {
  assert.ok(routeFile, "falta el archivo de rutas");
  const src = readFileSync(routeFile, "utf8");
  for (const path of [
    '"/royal-holiday/:empresaId/catalogo"',
    '"/royal-holiday/:empresaId/preview"',
    '"/royal-holiday/:empresaId/ventas"',
    '"/royal-holiday/:empresaId/comisiones-movimientos"',
    '"/royal-holiday/:empresaId/dias-descanso"',
    '"/royal-holiday/:empresaId/ops-config"',
    '"/royal-holiday/:empresaId/money-box-config"',
    '"/royal-holiday/:empresaId/premanifiesto/dia"',
    '"/royal-holiday/:empresaId/premanifiesto/cupos"',
    '"/royal-holiday/:empresaId/premanifiesto/registrar"',
    '"/royal-holiday/:empresaId/premanifiesto/:rowId/tomar-caso"',
    '"/royal-holiday/:empresaId/linea/asignacion"',
    '"/royal-holiday/:empresaId/linea/rotacion"',
    '"/royal-holiday/:empresaId/propinas"',
    '"/royal-holiday/:empresaId/okr"',
    '"/royal-holiday/:empresaId/resumen"',
  ]) {
    assert.match(src, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(src, /201/);
  assert.match(src, /fecha y workspaceId requeridos\./);
});
