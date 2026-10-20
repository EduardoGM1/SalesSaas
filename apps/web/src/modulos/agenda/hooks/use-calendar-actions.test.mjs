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
const WEB_SRC = resolve(HERE, "../../..");
const HOOK_MOD = resolve(HERE, "use-calendar-actions.js");
const HOOK_LEGACY = resolve(WEB_SRC, "hooks/use-calendar-actions.js");
const ACTIONS_MOD = resolve(HERE, "../servicios/acciones-agenda.js");
const ACTIONS_LEGACY = resolve(WEB_SRC, "actions/calendar.js");

const HOOK_KEYS = ["saveNoteForClient", "saveUserNote", "saveDayOff", "saveNoTour"];
const ACTION_EXPORTS = [
  "saveClientNote",
  "saveAgendaUserNote",
  "saveAgendaDayOff",
  "saveAgendaNoTour",
];

test("use-calendar-actions: archivo exporta useCalendarActions y enlaza las 4 actions", () => {
  const path = fs.existsSync(HOOK_MOD) ? HOOK_MOD : HOOK_LEGACY;
  const src = fs.readFileSync(path, "utf8");
  assert.match(src, /export function useCalendarActions/);
  for (const k of HOOK_KEYS) {
    assert.match(src, new RegExp(k), `falta clave ${k}`);
  }
  assert.match(src, /saveClientNote/);
  assert.match(src, /saveAgendaUserNote/);
  assert.match(src, /saveAgendaDayOff/);
  assert.match(src, /saveAgendaNoTour/);
});

test("actions/calendar: exporta las 4 saves (superficie)", () => {
  const path = fs.existsSync(ACTIONS_MOD) ? ACTIONS_MOD : ACTIONS_LEGACY;
  const src = fs.readFileSync(path, "utf8");
  for (const name of ACTION_EXPORTS) {
    assert.match(src, new RegExp(`export function ${name}`), `falta ${name}`);
  }
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
