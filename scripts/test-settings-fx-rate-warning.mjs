#!/usr/bin/env node
/**
 * Unit: mirrors apps/web/src/lib/currency/moneda-service.ts FX guards
 * and apps/web/src/actions/settings.js buildSettingsPayload usdToMxnRate.
 */
function isUnusualUsdToMxnRate(rate) {
  const n = Number(rate);
  return Number.isFinite(n) && n > 0 && n <= 1;
}

function unusualUsdToMxnRateMessage(_rate) {
  return "Tipo de cambio inusual: 1 USD = 1 MXN";
}

/** Mirror resolveUsdToMxnRate — never treat USD exchangeRate=1 as TC captura. */
function resolveUsdToMxnRate(settings) {
  const dedicated = Number(settings?.usdToMxnRate);
  if (Number.isFinite(dedicated) && dedicated > 0) return dedicated;
  if (settings?.currency === "MXN") {
    const er = Number(settings?.exchangeRate);
    if (Number.isFinite(er) && er > 0) return er;
  }
  return 18;
}

/** Pre-fix buggy display: usdToMxnRate ?? exchangeRate ?? 18 */
function displayValueBuggy(settings) {
  return settings.usdToMxnRate ?? settings.exchangeRate ?? 18;
}

/** Pre-fix buggy persist: Number(usdToMxnRate || exchangeRate || 18) */
function persistBuggy(settings) {
  return Number(settings.usdToMxnRate || settings.exchangeRate || 18);
}

/** Fixed persist / display effective rate */
function persistFixed(settings) {
  return resolveUsdToMxnRate(settings);
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

assert((Number("1") || 18) === 1, "Settings onChange keeps 1 (does not coerce to 18)");
assert((Number("0") || 18) === 18, "Settings onChange coerces 0 → 18");

assert(resolveUsdToMxnRate({ usdToMxnRate: 1 }) === 1, "usdToMxnRate=1 is stored and resolved");
assert(isUnusualUsdToMxnRate(resolveUsdToMxnRate({ usdToMxnRate: 1 })) === true, "resolved 1 triggers warning");

// Root cause: USD sala without dedicated TC
const usdUnset = { currency: "USD", exchangeRate: 1 };
assert(displayValueBuggy(usdUnset) === 1, "buggy UI shows exchangeRate=1");
assert(resolveUsdToMxnRate(usdUnset) === 18, "effective TC remains 18");
assert(persistBuggy(usdUnset) === 1, "buggy save would persist 1");
assert(persistFixed(usdUnset) === 18, "fixed save persists effective 18, not exchangeRate");
assert(isUnusualUsdToMxnRate(resolveUsdToMxnRate(usdUnset)) === false, "warning off when effective is 18");

// MXN operative may still use exchangeRate when usdToMxnRate unset
const mxn = { currency: "MXN", exchangeRate: 17.25 };
assert(resolveUsdToMxnRate(mxn) === 17.25, "MXN falls back to exchangeRate");
assert(persistFixed(mxn) === 17.25, "fixed save keeps MXN exchangeRate as captura TC");

// Explicit unusual dedicated rate still warns
assert(isUnusualUsdToMxnRate(resolveUsdToMxnRate({ currency: "USD", exchangeRate: 1, usdToMxnRate: 1 })) === true);

console.log("PASS test-settings-fx-rate-warning");
