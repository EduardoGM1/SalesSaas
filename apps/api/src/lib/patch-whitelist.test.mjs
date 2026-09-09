import test from "node:test";
import assert from "node:assert/strict";
import { activityToPatch, calendarEntryToPatch, saleToPatch } from "./patch-whitelist.js";

test("saleToPatch descarta workspace_id/prospect_id/user_id/created_at (mass assignment)", () => {
  const patch = saleToPatch({
    vol: "1500", status: "venta", workspace_id: "x", prospect_id: "y", user_id: "z", created_at: "2020-01-01", id: "w",
  });
  assert.deepEqual(Object.keys(patch).sort(), ["status", "vol"]);
  assert.equal(patch.vol, 1500);
});

test("saleToPatch acepta alias camelCase y normaliza fechas", () => {
  const patch = saleToPatch({ saleDate: "2026-09-09", processDate: "no-es-fecha", tours: 0 });
  assert.equal(patch.sale_date, "2026-09-09");
  assert.equal(patch.process_date, null);
  assert.equal(patch.tours, 1);
});

test("patch sin campos editables → 400", () => {
  assert.throws(() => saleToPatch({ workspace_id: "x" }), /Sin campos editables/);
  assert.throws(() => activityToPatch(null), /Body inválido/);
});

test("calendarEntryToPatch valida sale_id como uuid y descarta prospect_id", () => {
  const patch = calendarEntryToPatch({ sale_id: "not-uuid", prospect_id: "11111111-1111-4111-8111-111111111111", note: "hola" });
  assert.equal(patch.sale_id, null);
  assert.equal("prospect_id" in patch, false);
  assert.equal(patch.note, "hola");
});
