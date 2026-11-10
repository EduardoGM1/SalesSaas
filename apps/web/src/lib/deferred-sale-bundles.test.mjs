import assert from "node:assert/strict";
import { createDeferredSaleBundles } from "./deferred-sale-bundles.js";

const q = createDeferredSaleBundles();
const seen = [];

q.queue("c1", "s1");
q.queue("c1", "s1");
q.queue("c2", "s2");
assert.equal(q.size(), 2);

const n = q.flush((clientId, saleId) => {
  seen.push(`${clientId}:${saleId}`);
});
assert.equal(n, 2);
assert.equal(q.size(), 0);
assert.deepEqual(seen.sort(), ["c1:s1", "c2:s2"]);

assert.equal(q.flush(() => {}), 0);

console.log("deferred-sale-bundles.test.mjs: ok");
