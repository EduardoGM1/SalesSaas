/**
 * Etapa 2: pull teamScope filtrado por predicado (no ver_equipo solo).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { filterPullRowsForVisibility } from "@salesapp/shared/data/sync.js";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const P_VISIBLE = "33333333-3333-4333-8333-333333333333";
const P_HIDDEN = "44444444-4444-4444-8444-444444444444";

test("excepción / sin filtro: filter no aplica en pullAll vía visibilityException (caracterización filter)", () => {
  const rows = {
    prospects: [{ id: P_HIDDEN, user_id: OTHER }],
    sales: [{ id: "s1", user_id: OTHER, prospect_id: P_HIDDEN }],
    calendar_entries: [],
    goals: [],
    activities: [],
    tool_calculations: [],
  };
  const filtered = filterPullRowsForVisibility(rows, ME, { visibleProspectIds: [] });
  assert.equal(filtered.prospects.length, 0);
  assert.equal(filtered.sales.length, 0);
});

test("teamScope sin excepción: solo visible + propias por user_id", () => {
  const rows = {
    prospects: [
      { id: P_VISIBLE, user_id: OTHER },
      { id: P_HIDDEN, user_id: OTHER },
      { id: "p-own", user_id: ME },
    ],
    sales: [
      { id: "s1", user_id: OTHER, prospect_id: P_VISIBLE },
      { id: "s2", user_id: OTHER, prospect_id: P_HIDDEN },
      { id: "s3", user_id: ME, prospect_id: P_HIDDEN },
    ],
    calendar_entries: [{ id: "c1", user_id: OTHER, prospect_id: P_HIDDEN }],
    goals: [{ user_id: ME, year: 2026, month: 0 }],
    activities: [{ id: "a1", user_id: OTHER, prospect_id: P_VISIBLE }],
    tool_calculations: [{ id: "t1", user_id: OTHER, prospect_id: P_HIDDEN }],
  };
  const filtered = filterPullRowsForVisibility(rows, ME, {
    visibleProspectIds: [P_VISIBLE],
  });
  assert.deepEqual(filtered.prospects.map((p) => p.id).sort(), [P_VISIBLE, "p-own"].sort());
  assert.deepEqual(filtered.sales.map((s) => s.id).sort(), ["s1", "s3"]);
  assert.equal(filtered.activities.length, 1);
  assert.equal(filtered.tool_calculations.length, 0);
  assert.equal(filtered.calendar_entries.length, 0);
  assert.equal(filtered.goals.length, 1, "goals no se recortan aquí");
});

test("dueño en visibleProspectIds: expediente ajeno asignado se conserva", () => {
  const rows = {
    prospects: [{ id: P_VISIBLE, user_id: OTHER }],
    sales: [],
    calendar_entries: [],
    goals: [],
    activities: [],
    tool_calculations: [{ id: "t1", user_id: ME, prospect_id: P_VISIBLE, tool: "survey" }],
  };
  const filtered = filterPullRowsForVisibility(rows, ME, { visibleProspectIds: [P_VISIBLE] });
  assert.equal(filtered.prospects.length, 1);
  assert.equal(filtered.tool_calculations.length, 1);
});
