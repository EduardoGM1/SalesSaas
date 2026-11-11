/**
 * Etapa 3 residual — Agenda usa allowlist sala en tours y entradas cal.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

test("calendar-page aplica scopeClientsForDerivedViews y cal filtrado", () => {
  const src = readFileSync(resolve(WEB, "modulos/agenda/ui/calendar-page.jsx"), "utf8");
  assert.match(src, /fachada-visibilidad/);
  assert.match(src, /scopeClientsForDerivedViews/);
  assert.match(src, /scopeCalMonthForDerivedViews/);
  assert.match(src, /clientsForAgenda/);
  assert.match(src, /calForAgenda/);
});

test("goals-page filtra clients y cal en sala", () => {
  const src = readFileSync(resolve(WEB, "components/goals/goals-page.jsx"), "utf8");
  assert.match(src, /fachada-visibilidad/);
  assert.match(src, /scopeClientsForDerivedViews/);
  assert.match(src, /clientsForDashboard/);
  assert.match(src, /productionTourSaleCounts\(clientsForDashboard/);
});
