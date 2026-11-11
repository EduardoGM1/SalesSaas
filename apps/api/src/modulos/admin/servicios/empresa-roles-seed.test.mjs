/**
 * Caracterización D2 residual: seed *:ver_equipo solo en gerente.
 * No ejecuta BD; fija el contrato de claves / slugs del seed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  VER_EQUIPO_CLAVES,
  SEED_KEEPS_VER_EQUIPO,
  workflowKeysForOperationalRole,
} from "./empresa-roles-seed.js";

test("VER_EQUIPO_CLAVES cubre las cuatro claves de equipo", () => {
  assert.deepEqual([...VER_EQUIPO_CLAVES].sort(), [
    "dashboard:ver_equipo",
    "expedientes:ver_equipo",
    "metas:ver_equipo",
    "ventas:ver_equipo",
  ].sort());
});

test("solo el slug gerente conserva ver_equipo en el seed", () => {
  assert.equal(SEED_KEEPS_VER_EQUIPO.has("gerente"), true);
  for (const slug of [
    "liner",
    "cerrador",
    "marketing",
    "opc",
    "asistente_sala",
    "asistente_empresa",
    "representante",
    "colaborador",
  ]) {
    assert.equal(SEED_KEEPS_VER_EQUIPO.has(slug), false, slug);
  }
});

test("workflowKeys: gerente incluye *:ver_equipo", () => {
  const keys = workflowKeysForOperationalRole("gerente");
  for (const clave of VER_EQUIPO_CLAVES) {
    assert.ok(keys.includes(clave), clave);
  }
  assert.ok(keys.includes("workflow:revisar"));
  assert.ok(keys.includes("workflow:asignar_cerrador"));
});

test("workflowKeys: liner/marketing/opc sin ver_equipo", () => {
  for (const slug of ["liner", "marketing", "opc", "otro"]) {
    const keys = workflowKeysForOperationalRole(slug);
    assert.deepEqual(keys, ["workflow:ver", "workflow:avanzar"]);
    for (const clave of VER_EQUIPO_CLAVES) {
      assert.equal(keys.includes(clave), false, `${slug}:${clave}`);
    }
  }
});

test("workflowKeys: cerrador cierra sin ver_equipo", () => {
  const keys = workflowKeysForOperationalRole("cerrador");
  assert.deepEqual(keys, ["workflow:ver", "workflow:avanzar", "workflow:cerrar"]);
  for (const clave of VER_EQUIPO_CLAVES) {
    assert.equal(keys.includes(clave), false, clave);
  }
});
