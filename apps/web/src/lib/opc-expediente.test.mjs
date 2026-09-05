import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { firstSingleName, matchOlaByHora, normalizeHora } from "./opc-expediente.js";

describe("opc-expediente helpers", () => {
  it("toma el primer token como nombre CRM", () => {
    assert.equal(firstSingleName("Juan Perez"), "Juan");
    assert.equal(firstSingleName(""), "Pareja");
    assert.equal(firstSingleName("  María  "), "María");
  });

  it("normaliza hora HH:MM", () => {
    assert.equal(normalizeHora("9:30:00"), "09:30");
    assert.equal(normalizeHora("10:30"), "10:30");
  });

  it("empareja ola por hora", () => {
    const olas = [
      { ola_config_id: "a", hora: "09:00", etiqueta: "OLA 1" },
      { ola_config_id: "b", hora: "11:00:00", etiqueta: "OLA 2" },
    ];
    assert.equal(matchOlaByHora(olas, "11:00").ola_config_id, "b");
    assert.equal(matchOlaByHora(olas, "12:00"), null);
  });
});
