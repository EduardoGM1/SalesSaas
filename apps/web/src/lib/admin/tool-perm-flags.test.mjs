import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dropDisallowedToolPerms,
  permisosVisiblesParaFlags,
} from "../../../../../packages/shared/src/auth/permission-catalog.js";

describe("dropDisallowedToolPerms", () => {
  it("quita herramientas del módulo apagado y conserva expedientes", () => {
    const next = dropDisallowedToolPerms(
      ["worksheet"],
      ["herramientas:survey", "herramientas:worksheet", "expedientes:ver"],
    );
    assert.equal(next.has("herramientas:survey"), false);
    assert.equal(next.has("herramientas:worksheet"), true);
    assert.equal(next.has("expedientes:ver"), true);
  });
});

describe("permisosVisiblesParaFlags", () => {
  const catalog = [
    { clave: "herramientas:survey", capa: "app" },
    { clave: "expedientes:ver", capa: "app" },
    { clave: "usuarios.cambiar_plan", capa: "admin" },
  ];

  it("oculta survey si el flag no está y nunca muestra capa admin", () => {
    const visible = permisosVisiblesParaFlags(catalog, []);
    assert.deepEqual(visible.map((p) => p.clave), ["expedientes:ver"]);
  });

  it("muestra survey cuando el módulo está activo", () => {
    const visible = permisosVisiblesParaFlags(catalog, ["survey"]);
    assert.deepEqual(visible.map((p) => p.clave), ["herramientas:survey", "expedientes:ver"]);
  });
});
