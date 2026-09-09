import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ROYAL_HOLIDAY_EMPRESA_ID } from "./auth/tool-flags.js";
import { getRhOpcHomeHref, navOptionsFromSession, RH_OPC_CALENDAR_HREF } from "./rh-opc-home.js";

const rhSala = {
  workspaceTipo: "sala_de_venta",
  empresaId: ROYAL_HOLIDAY_EMPRESA_ID,
  isGerenteSala: false,
  isAdmin: false,
};

describe("getRhOpcHomeHref", () => {
  it("OPC en sala RH aterriza en Premanifiesto", () => {
    assert.equal(getRhOpcHomeHref({ ...rhSala, roleSlug: "opc" }), RH_OPC_CALENDAR_HREF);
  });

  it("Liner y Cerrador siguen en Agenda", () => {
    assert.equal(getRhOpcHomeHref({ ...rhSala, roleSlug: "liner" }), "/");
    assert.equal(getRhOpcHomeHref({ ...rhSala, roleSlug: "cerrador" }), "/");
  });

  it("Gerente no usa el home OPC", () => {
    assert.equal(getRhOpcHomeHref({
      ...rhSala,
      roleSlug: "gerente",
      isGerenteSala: true,
    }), "/");
  });

  it("navOptionsFromSession respeta role_slug opc", () => {
    const href = getRhOpcHomeHref(navOptionsFromSession({
      flags: {},
      workspace_activo: {
        tipo: "sala_de_venta",
        empresa_id: ROYAL_HOLIDAY_EMPRESA_ID,
        role_slug: "opc",
        rol_en_workspace: "vendedor",
      },
    }));
    assert.equal(href, RH_OPC_CALENDAR_HREF);
  });
});
