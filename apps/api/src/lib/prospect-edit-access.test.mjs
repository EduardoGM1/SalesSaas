import assert from "node:assert/strict";
import test from "node:test";
import { canEditProspectRecord } from "./prospect-edit-access.js";

const ACTOR = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const prospect = { id: "p1", user_id: ACTOR, workspace_id: "w1" };

test("dueño con expedientes:editar puede editar", () => {
  assert.equal(
    canEditProspectRecord({
      actorId: ACTOR,
      prospect,
      workflow: null,
      permissions: new Set(["expedientes:editar"]),
    }),
    true,
  );
});

test("dueño sin expedientes:editar no edita solo por ser dueño", () => {
  assert.equal(
    canEditProspectRecord({
      actorId: ACTOR,
      prospect,
      workflow: null,
      permissions: new Set(),
    }),
    false,
  );
});

test("cerrador asignado puede editar aunque no tenga ver_equipo", () => {
  assert.equal(
    canEditProspectRecord({
      actorId: OTHER,
      prospect: { ...prospect, user_id: ACTOR },
      workflow: { representante_id: ACTOR, cerrador_id: OTHER },
      permissions: new Set(),
    }),
    true,
  );
});

test("ver_equipo solo no basta para editar expediente ajeno", () => {
  assert.equal(
    canEditProspectRecord({
      actorId: OTHER,
      prospect,
      workflow: { representante_id: ACTOR, cerrador_id: null },
      permissions: new Set(["expedientes:ver_equipo"]),
      memberRole: "vendedor",
    }),
    false,
  );
});

test("gerente de sala puede editar expediente ajeno", () => {
  assert.equal(
    canEditProspectRecord({
      actorId: OTHER,
      prospect,
      workflow: { representante_id: ACTOR, cerrador_id: null },
      permissions: new Set(),
      memberRole: "gerente",
    }),
    true,
  );
});
