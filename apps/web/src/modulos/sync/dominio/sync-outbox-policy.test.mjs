import assert from "node:assert/strict";
import {
  BACKOFF_BASE_MS,
  BACKOFF_CAP_MS,
  backoffDelayMs,
  canAttemptAt,
  isPermanentRejectCode,
  mergeBlocked,
  nextAttemptAtFromFailCount,
  splitRejected,
  stripBlockedFromDb,
} from "./sync-outbox-policy.js";

assert.equal(isPermanentRejectCode("sin_permiso"), true);
assert.equal(isPermanentRejectCode("ajeno"), true);
assert.equal(isPermanentRejectCode("rls_insert"), false);

assert.equal(backoffDelayMs(1), BACKOFF_BASE_MS);
assert.equal(backoffDelayMs(2), BACKOFF_BASE_MS * 2);
assert.equal(backoffDelayMs(3), BACKOFF_BASE_MS * 4);
assert.equal(backoffDelayMs(20), BACKOFF_CAP_MS);

const now = 1_000_000;
assert.equal(nextAttemptAtFromFailCount(1, now), now + BACKOFF_BASE_MS);
assert.equal(canAttemptAt(now + 1, now), false);
assert.equal(canAttemptAt(now, now), true);
assert.equal(canAttemptAt(null, now), true);

const split = splitRejected([
  { table: "prospects", id: "a", code: "sin_permiso" },
  { table: "sales", id: "b", code: "rls_insert" },
  { table: "prospects", id: null, code: "ajeno" },
]);
assert.equal(split.permanent.length, 1);
assert.equal(split.transient.length, 1);

const blocked = mergeBlocked(
  [{ table: "prospects", id: "a", code: "sin_permiso" }],
  [{ table: "prospects", id: "a", code: "conflicto_oculto" }, { table: "sales", id: "s1", code: "ajeno" }],
);
assert.equal(blocked.length, 2);
assert.equal(blocked.find((r) => r.id === "a").code, "conflicto_oculto");

const db = {
  clients: {
    a: { id: "a", name: "A", sales: [{ saleId: "s1" }, { saleId: "s2" }], activities: [{ id: "act1" }] },
    keep: { id: "keep", name: "K", sales: [], activities: [] },
  },
  sales: { s1: { saleId: "s1" }, s9: { saleId: "s9" } },
  cal: {
    "2026-11": {
      days: {
        10: [{ id: "c1", t: "venta" }, { id: "c2", t: "nota" }],
      },
    },
  },
  goals: { g1: { id: "g1" }, g2: { id: "g2" } },
};

const stripped = stripBlockedFromDb(db, [
  { table: "prospects", id: "a", code: "sin_permiso" },
  { table: "sales", id: "s1", code: "ajeno" },
  { table: "calendar_entries", id: "c1", code: "sin_permiso" },
  { table: "goals", id: "g1", code: "ajeno" },
]);

assert.equal(stripped.clients.a, undefined);
assert.ok(stripped.clients.keep);
assert.equal(stripped.sales.s1, undefined);
assert.ok(stripped.sales.s9);
assert.equal(stripped.cal["2026-11"].days[10].length, 1);
assert.equal(stripped.cal["2026-11"].days[10][0].id, "c2");
assert.equal(stripped.goals.g1, undefined);
assert.ok(stripped.goals.g2);

console.log("sync-outbox-policy.test.mjs: ok");
