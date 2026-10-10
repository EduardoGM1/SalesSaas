#!/usr/bin/env node
/**
 * Unit: mirrors apps/web/src/lib/currency/moneda-service.ts FX guards.
 * Keep in sync with isUnusualUsdToMxnRate / unusualUsdToMxnRateMessage.
 */
function isUnusualUsdToMxnRate(rate) {
  const n = Number(rate);
  return Number.isFinite(n) && n > 0 && n <= 1;
}

function unusualUsdToMxnRateMessage(_rate) {
  return "Tipo de cambio inusual: 1 USD = 1 MXN";
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(isUnusualUsdToMxnRate(1) === true, "1 is unusual");
assert(isUnusualUsdToMxnRate(0.5) === true, "0.5 is unusual");
assert(isUnusualUsdToMxnRate(0) === false, "0 not unusual (invalid / coerced away)");
assert(isUnusualUsdToMxnRate(18) === false, "18 is normal");
assert(isUnusualUsdToMxnRate(17.5) === false, "17.5 is normal");
assert(isUnusualUsdToMxnRate(null) === false, "null not unusual");
assert(isUnusualUsdToMxnRate(undefined) === false, "undefined not unusual");
assert(isUnusualUsdToMxnRate(Number.NaN) === false, "NaN not unusual");

assert(
  unusualUsdToMxnRateMessage(1) === "Tipo de cambio inusual: 1 USD = 1 MXN",
  "message text",
);

// Can TC=1 be persisted via Settings onChange? Number(v)||18 keeps 1.
assert((Number("1") || 18) === 1, "Settings onChange keeps 1 (does not coerce to 18)");
assert((Number("0") || 18) === 18, "Settings onChange coerces 0 → 18");
// Dedicated usdToMxnRate=1 is used by resolveUsdToMxnRate (not defaulted to 18)
function resolveUsdToMxnRate(settings) {
  const dedicated = Number(settings?.usdToMxnRate);
  if (Number.isFinite(dedicated) && dedicated > 0) return dedicated;
  return 18;
}
assert(resolveUsdToMxnRate({ usdToMxnRate: 1 }) === 1, "usdToMxnRate=1 is stored and resolved");
assert(isUnusualUsdToMxnRate(resolveUsdToMxnRate({ usdToMxnRate: 1 })) === true, "resolved 1 triggers warning");

console.log("PASS test-settings-fx-rate-warning");
