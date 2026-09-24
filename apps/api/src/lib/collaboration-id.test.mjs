import assert from "node:assert/strict";
import test from "node:test";
import { readCollaborationId } from "./collaboration-id.js";

test("conserva espacios y guiones tal como se escribieron", () => {
  assert.equal(readCollaborationId("RH 2026 20", "Contrato"), "RH 2026 20");
  assert.equal(readCollaborationId("RH 2026-20", "VLO"), "RH 2026-20");
  assert.equal(readCollaborationId("RH202620", "Prospect ID"), "RH202620");
  assert.equal(readCollaborationId("  ", "VLO"), null);
  assert.equal(readCollaborationId(null, "VLO"), null);
});

test("no aplica la regla de una sola palabra ni recorta a 15", () => {
  const escrito = "AB12 CD34-EF56 GH78";
  assert.equal(readCollaborationId(escrito, "Contrato"), escrito);
  assert.equal(escrito.length > 15, true);
  assert.throws(() => readCollaborationId("RH_2026", "Contrato"), /espacios y guiones/);
  assert.throws(
    () => readCollaborationId("R".repeat(41), "Contrato"),
    /espacios y guiones/,
  );
});
