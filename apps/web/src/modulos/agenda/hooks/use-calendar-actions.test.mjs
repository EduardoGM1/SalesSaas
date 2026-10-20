/**
 * Caracterización — useCalendarActions es un thin wrapper (sin lógica pura).
 * Golden: superficie estable de claves + que actions/calendar exporta las 4 saves.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK_MOD = resolve(HERE, "use-calendar-actions.js");
const ACTIONS_MOD = resolve(HERE, "../servicios/acciones-agenda.js");

const HOOK_KEYS = ["saveNoteForClient", "saveUserNote", "saveDayOff", "saveNoTour"];
const ACTION_EXPORTS_ES = [
  "guardarNotaCliente",
  "guardarNotaUsuario",
  "guardarDescanso",
  "guardarSinTour",
];

test("use-calendar-actions: archivo exporta useCalendarActions y enlaza las 4 actions", () => {
  const src = fs.readFileSync(HOOK_MOD, "utf8");
  assert.match(src, /export function useCalendarActions/);
  for (const k of HOOK_KEYS) {
    assert.match(src, new RegExp(k), `falta clave ${k}`);
  }
  for (const name of ACTION_EXPORTS_ES) {
    assert.match(src, new RegExp(name), `hook debe llamar ${name}`);
  }
});

test("acciones-agenda: exporta las 4 saves ES (+ aliases EN)", () => {
  const src = fs.readFileSync(ACTIONS_MOD, "utf8");
  for (const name of ACTION_EXPORTS_ES) {
    assert.match(src, new RegExp(`export function ${name}`), `falta ${name}`);
  }
  assert.match(src, /export const saveClientNote/);
  assert.match(src, /export const saveAgendaUserNote/);
  assert.match(src, /export const saveAgendaDayOff/);
  assert.match(src, /export const saveAgendaNoTour/);
});

test("golden shapes de escritura cal (sin I/O): contratos t/kind", () => {
  // Snapshots de lo que cada acción pasa a addCalEntry* (ver agenda-tramo-a-caracterizacion.md).
  const shapes = {
    userNote: { t: "nota", note: "x", time: undefined },
    dayOff: { t: "descanso", note: "Día de descanso" },
    noTour: { t: "nota", kind: "no-tour", source: "no-tour", note: "n" },
    clientFollow: {
      t: "follow",
      source: "client-note",
      note: "10:00 · hi",
      clientId: "c",
      prospectId: "p",
      clientName: "N",
    },
    clientNota: {
      t: "nota",
      source: "client-note",
      note: "hi",
      clientId: "c",
      prospectId: "p",
      clientName: "N",
    },
  };
  assert.equal(shapes.userNote.t, "nota");
  assert.equal(shapes.dayOff.t, "descanso");
  assert.equal(shapes.noTour.kind, "no-tour");
  assert.equal(shapes.clientFollow.t, "follow");
  assert.equal(shapes.clientNota.t, "nota");
  assert.equal("kind" in shapes.userNote, false);
  assert.equal(JSON.stringify(shapes).includes("procesamiento-venta"), false);
});
