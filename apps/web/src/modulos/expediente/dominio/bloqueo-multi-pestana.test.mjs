import assert from "node:assert/strict";
import test from "node:test";
import {
  getOrCreateTabId,
  shouldIgnoreRemoteLock,
  isOwnTabLock,
  isSameUserOtherTab,
  TAB_ID_STORAGE_KEY,
} from "./bloqueo-multi-pestana.js";

function memStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
  };
}

test("getOrCreateTabId reutiliza sessionStorage", () => {
  const s = memStorage({ [TAB_ID_STORAGE_KEY]: "tab-abc-12345" });
  assert.equal(getOrCreateTabId(s), "tab-abc-12345");
  assert.equal(getOrCreateTabId(s), "tab-abc-12345");
});

test("getOrCreateTabId crea id estable si falta", () => {
  const s = memStorage();
  const a = getOrCreateTabId(s);
  const b = getOrCreateTabId(s);
  assert.equal(a, b);
  assert.ok(a.length >= 8);
});

test("shouldIgnoreRemoteLock: eco de la misma pestaña", () => {
  assert.equal(
    shouldIgnoreRemoteLock({
      myTabId: "t1",
      myUserId: "u1",
      payload: { user_id: "u1", tab_id: "t1" },
    }),
    true,
  );
});

test("shouldIgnoreRemoteLock: otra pestaña mismo user NO se ignora", () => {
  assert.equal(
    shouldIgnoreRemoteLock({
      myTabId: "t1",
      myUserId: "u1",
      payload: { user_id: "u1", tab_id: "t2" },
    }),
    false,
  );
});

test("shouldIgnoreRemoteLock: legacy sin tab_id del mismo user se ignora", () => {
  assert.equal(
    shouldIgnoreRemoteLock({
      myTabId: "t1",
      myUserId: "u1",
      payload: { user_id: "u1" },
    }),
    true,
  );
});

test("shouldIgnoreRemoteLock: otro usuario no se ignora", () => {
  assert.equal(
    shouldIgnoreRemoteLock({
      myTabId: "t1",
      myUserId: "u1",
      payload: { user_id: "u2", tab_id: "tx" },
    }),
    false,
  );
});

test("isOwnTabLock / isSameUserOtherTab", () => {
  assert.equal(isOwnTabLock({ myTabId: "t1", myUserId: "u1", lock: { user_id: "u1", tab_id: "t1" } }), true);
  assert.equal(isOwnTabLock({ myTabId: "t1", myUserId: "u1", lock: { user_id: "u1", tab_id: "t2" } }), false);
  assert.equal(isSameUserOtherTab({ myTabId: "t1", myUserId: "u1", lock: { user_id: "u1", tab_id: "t2" } }), true);
  assert.equal(isSameUserOtherTab({ myTabId: "t1", myUserId: "u1", lock: { user_id: "u2", tab_id: "t2" } }), false);
  assert.equal(isOwnTabLock({ myTabId: "t1", myUserId: "u1", lock: { user_id: "u1" } }), true, "legacy sin tab");
});
