import assert from "node:assert/strict";
import test from "node:test";
import {
  isVisibilityException,
  canViewProspectByPredicate,
  WORKFLOW_PERSON_COLUMNS,
} from "./visibilidad-expediente.js";

test("excepción: gerente por rol_en_workspace", () => {
  assert.equal(isVisibilityException({ rolEnWorkspace: "gerente" }), true);
});

test("excepción: asistente_sala / asistente_empresa / gerente por slug", () => {
  assert.equal(isVisibilityException({ roleSlug: "asistente_sala" }), true);
  assert.equal(isVisibilityException({ roleSlug: "asistente_empresa" }), true);
  assert.equal(isVisibilityException({ roleSlug: "gerente" }), true);
});

test("excepción: es_admin y superadmin", () => {
  assert.equal(isVisibilityException({ esAdminEmpresa: true }), true);
  assert.equal(isVisibilityException({ isSuperAdmin: true }), true);
});

test("D2: ver_equipo / cerrador / liner NO son excepción", () => {
  assert.equal(isVisibilityException({ roleSlug: "cerrador" }), false);
  assert.equal(isVisibilityException({ roleSlug: "liner" }), false);
  assert.equal(isVisibilityException({ rolEnWorkspace: "vendedor" }), false);
  assert.equal(isVisibilityException({}), false);
});

test("dueño ve; ajeno sin asignación no", () => {
  const uid = "u1";
  assert.equal(canViewProspectByPredicate(uid, { user_id: uid }, null), true);
  assert.equal(canViewProspectByPredicate(uid, { user_id: "otro" }, null), false);
});

test("D1: collab 0093 cuenta como asignado", () => {
  const uid = "u1";
  assert.equal(
    canViewProspectByPredicate(uid, { user_id: "otro" }, { opc_id: uid }),
    true,
  );
  assert.equal(
    canViewProspectByPredicate(uid, { user_id: "otro" }, { hostes_id: uid }),
    true,
  );
  assert.equal(
    canViewProspectByPredicate(uid, { user_id: "otro" }, { representante_id: "x" }),
    false,
  );
});

test("share activo otorga ver", () => {
  assert.equal(
    canViewProspectByPredicate("u1", { user_id: "otro" }, null, { shared: true }),
    true,
  );
});

test("columnas de persona incluyen core + 0093", () => {
  assert.ok(WORKFLOW_PERSON_COLUMNS.includes("representante_id"));
  assert.ok(WORKFLOW_PERSON_COLUMNS.includes("cerrador_id"));
  assert.ok(WORKFLOW_PERSON_COLUMNS.includes("gerente_id"));
  assert.ok(WORKFLOW_PERSON_COLUMNS.includes("opc_id"));
  assert.equal(WORKFLOW_PERSON_COLUMNS.length, 14);
});
