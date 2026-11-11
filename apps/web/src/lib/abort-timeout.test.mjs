import assert from "node:assert/strict";
import { abortTimeout } from "./abort-timeout.js";

const signal = abortTimeout(50);
assert.equal(signal.aborted, false);

await new Promise((resolve) => setTimeout(resolve, 80));
assert.equal(signal.aborted, true);

console.log("abort-timeout.test.mjs: ok");
