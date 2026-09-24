import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCollaborationId, readCollaborationId } from "./collaboration-id.js";

test("acepta letras y números y conserva ambos", () => {
  assert.equal(normalizeCollaborationId("VLO12"), "VLO12");
  assert.throws(() => readCollaborationId("C-2048", "Contrato"), /letras y números/);
  assert.equal(readCollaborationId("P99421", "Prospect ID"), "P99421");
  assert.equal(readCollaborationId("  ", "VLO"), null);
  assert.equal(readCollaborationId(null, "VLO"), null);
});

test("no recorta a 15 ni exige una sola palabra de solo letras", () => {
  const largo = "AB12CD34EF56GH78IJ90";
  assert.equal(normalizeCollaborationId(largo), largo);
  assert.equal(largo.length > 15, true);
});
