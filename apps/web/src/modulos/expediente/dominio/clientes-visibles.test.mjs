import assert from "node:assert/strict";
import test from "node:test";
import {
  filterCalMonthVisibles,
  filterClientsVisibles,
  isCalEntryVisible,
  isLocalOnlyDraft,
  localIdsToPurgeAfterMirror,
} from "./clientes-visibles.js";

test("personal / sin sala: no filtra", () => {
  const clients = { a: { id: "a" }, b: { id: "b" } };
  assert.deepEqual(filterClientsVisibles(clients, { isSala: false }), clients);
});

test("sala sin remoteIds: no filtra (evita flash vacío)", () => {
  const clients = { a: { id: "a" }, b: { id: "b" } };
  assert.deepEqual(filterClientsVisibles(clients, { isSala: true, remoteIds: null }), clients);
});

test("sala con allowlist: solo remotos + drafts locales", () => {
  const clients = {
    a: { id: "a" },
    b: { id: "b" },
    d: { id: "d", localOnly: true },
  };
  const out = filterClientsVisibles(clients, { isSala: true, remoteIds: ["a"] });
  assert.deepEqual(Object.keys(out).sort(), ["a", "d"]);
  assert.equal(isLocalOnlyDraft(clients.d), true);
});

test("purge tras mirror: no borra drafts", () => {
  const clients = {
    a: { id: "a" },
    b: { id: "b" },
    d: { id: "d", pendingCreate: true },
  };
  assert.deepEqual(localIdsToPurgeAfterMirror(clients, ["a"]).sort(), ["b"]);
});

test("huérfano en sala (sin flags) va a purge", () => {
  const orphan = { id: "ghost", name: "Antiguo sync" };
  assert.equal(isLocalOnlyDraft(orphan), false);
  assert.deepEqual(localIdsToPurgeAfterMirror({ ghost: orphan }, []), ["ghost"]);
});

test("entrada cal: sin prospecto se conserva en sala", () => {
  const allow = new Set(["a"]);
  assert.equal(isCalEntryVisible({ t: "nota", note: "x" }, allow, { isSala: true }), true);
  assert.equal(isCalEntryVisible({ t: "venta", saleId: "s1" }, allow, { isSala: true }), true);
});

test("entrada cal: clientId ajeno se oculta", () => {
  const allow = new Set(["a"]);
  assert.equal(isCalEntryVisible({ clientId: "b" }, allow, { isSala: true }), false);
  assert.equal(isCalEntryVisible({ prospectId: "a" }, allow, { isSala: true }), true);
});

test("filterCalMonthVisibles quita días vacíos tras filtro", () => {
  const month = {
    days: {
      1: [{ t: "nota" }],
      2: [{ t: "follow", clientId: "ghost" }],
    },
  };
  const out = filterCalMonthVisibles(month, new Set(["a"]), { isSala: true });
  assert.deepEqual(Object.keys(out.days).map(Number).sort(), [1]);
  assert.equal(out.days[1].length, 1);
});
