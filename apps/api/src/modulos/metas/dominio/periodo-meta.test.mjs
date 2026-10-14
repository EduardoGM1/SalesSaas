/**
 * Caracterización metas API (antes/después del move).
 * Valida periodo y bodyToGoalUpsert (shared) con casos sintéticos — sin I/O.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { bodyToGoalUpsert } from "@salesapp/shared/api/validators.js";
import { validarPeriodoMeta } from "./periodo-meta.js";

const UID = "00000000-0000-4000-8000-000000000001";
const WS = "00000000-0000-4000-8000-000000000002";

test("validarPeriodoMeta: enteros válidos / inválidos", () => {
  assert.equal(validarPeriodoMeta(2026, 0).ok, true);
  assert.equal(validarPeriodoMeta(2026, 11).ok, true);
  assert.equal(validarPeriodoMeta(2026, 12).ok, false);
  assert.equal(validarPeriodoMeta(2026, -1).ok, false);
  assert.equal(validarPeriodoMeta(1999, 5).ok, false);
  assert.equal(validarPeriodoMeta(2026.5, 5).ok, false);
  assert.equal(validarPeriodoMeta("2026", 5).ok, false);
  assert.equal(validarPeriodoMeta(2026, "5").ok, false);
  assert.equal(validarPeriodoMeta(NaN, 5).ok, false);
});

test("bodyToGoalUpsert: year/month y columnas de contrato", () => {
  assert.equal(bodyToGoalUpsert({}, UID, WS), null);
  assert.equal(bodyToGoalUpsert({ year: 2026, month: 12 }, UID, WS), null);
  assert.equal(bodyToGoalUpsert({ year: 2026, month: -1 }, UID, WS), null);

  const row = bodyToGoalUpsert(
    { year: 2026, month: 9, vol: 500000, tours: 30, ventas: 10, dias: 20, descansos: 2 },
    UID,
    WS,
  );
  assert.ok(row);
  assert.equal(row.user_id, UID);
  assert.equal(row.workspace_id, WS);
  assert.equal(row.year, 2026);
  assert.equal(row.month, 9);
  assert.equal(row.vol, 500000);
  assert.equal(row.tours, 30);
  assert.equal(row.ventas, 10);
  assert.equal(row.dias, 20);
  assert.equal(row.descansos, 2);

  const fromDesc = bodyToGoalUpsert({ year: 2026, month: 0, desc: 3 }, UID, WS);
  assert.equal(fromDesc.descansos, 3);
});
