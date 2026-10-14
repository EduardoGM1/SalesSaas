/**
 * Columnas goals en SYNC_SELECT (shared-only; no hay copia web — ver sync-shared-files.json).
 * Deuda sync: mappers/outbox no se migran en este módulo.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../../../../");

test("SYNC_SELECT.goals (shared) incluye columnas de contrato", () => {
  const src = readFileSync(resolve(ROOT, "packages/shared/src/data/sync-columns.js"), "utf8");
  const m = src.match(/goals:\s*\n\s*"([^"]+)"/);
  assert.ok(m, "goals select no encontrado");
  const cols = m[1].split(",");
  for (const col of ["user_id", "workspace_id", "year", "month", "vol", "tours", "ventas", "dias", "descansos", "updated_at"]) {
    assert.ok(cols.includes(col), `falta columna ${col}`);
  }
});
