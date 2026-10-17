import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { noteThrottledWarn, WARN_THROTTLE_MS } from "./expediente-field-lock-helpers.js";

const HERE = dirname(fileURLToPath(import.meta.url));

test("noteThrottledWarn: primer call emite; segundo dentro de ventana no", () => {
  const map = new Map();
  assert.equal(noteThrottledWarn(map, "lock", 1000, 5000), true);
  assert.equal(noteThrottledWarn(map, "lock", 2000, 5000), false);
  assert.equal(noteThrottledWarn(map, "lock", 1000 + WARN_THROTTLE_MS, 5000), true);
  assert.equal(noteThrottledWarn(map, "unlock", 2100, 5000), true, "otra clave independiente");
});

test("tearDownChannels envía unlock best-effort antes de untrack", () => {
  const src = readFileSync(resolve(HERE, "expediente-realtime.js"), "utf8");
  const tearIdx = src.indexOf("async function tearDownChannels");
  assert.ok(tearIdx > 0);
  const slice = src.slice(tearIdx, tearIdx + 1200);
  assert.match(slice, /broadcastUnlock\(focused\)/, "unlock antes de limpiar foco");
  const unlockAt = slice.indexOf("broadcastUnlock(focused)");
  const untrackAt = slice.indexOf("pCh.untrack");
  assert.ok(unlockAt >= 0 && untrackAt > unlockAt, "unlock debe ir antes de pCh.untrack");
  assert.match(src, /warnThrottled\(/, "warns de broadcast van por throttle");
});
