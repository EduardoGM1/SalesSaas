import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isLibraryModuleTemplate,
  isRoleTechnicalPackage,
  snapshotFromLibraryTemplate,
} from "./paquete-template-kind.js";

describe("paquete-template-kind", () => {
  it("trata slugs de biblioteca de sistema como plantillas", () => {
    assert.equal(isRoleTechnicalPackage({ slug: "cierre", nombre: "Cierre" }), false);
    assert.equal(isLibraryModuleTemplate({ slug: "liner", nombre: "Liner" }), true);
  });

  it("detecta paquetes técnicos por slug puesto-*", () => {
    assert.equal(
      isRoleTechnicalPackage({ slug: "puesto-recepcion", nombre: "Recepción (módulos)" }),
      true,
    );
  });

  it("detecta paquetes técnicos por descripción autogenerada", () => {
    assert.equal(
      isRoleTechnicalPackage({
        slug: "custom-x",
        descripcion: "Módulos del puesto Recepción",
      }),
      true,
    );
  });

  it("plantillas custom creadas a mano siguen en biblioteca", () => {
    assert.equal(
      isLibraryModuleTemplate({
        slug: "vip-sales",
        nombre: "Ventas VIP",
        descripcion: "Survey + Worksheet",
      }),
      true,
    );
  });
});

describe("snapshotFromLibraryTemplate", () => {
  it("copia módulos de la plantilla y acciones del puesto homólogo, sin paquete_id", () => {
    const snap = snapshotFromLibraryTemplate(
      {
        slug: "liner",
        paquete_flags: [{ activo: true, flags: { clave: "survey" } }],
      },
      [{ slug: "liner", es_sistema: true, nombre: "Liner", permission_keys: ["workflow:ver", "herramientas:survey"] }],
    );
    assert.deepEqual(snap.flag_keys, ["survey"]);
    assert.deepEqual(snap.permission_keys, ["workflow:ver", "herramientas:survey"]);
    assert.equal(snap.paquete_id, undefined);
    assert.equal(snap.sourceRoleName, "Liner");
  });
});
