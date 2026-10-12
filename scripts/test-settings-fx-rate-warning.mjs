#!/usr/bin/env node
/**
 * Unit: normalizeUsdToMxnRate + resolve + payload/hydrate mirrors.
 */
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const webSrc = (...parts) => pathToFileURL(resolve(__dir, "../apps/web/src", ...parts)).href;

const { normalizeUsdToMxnRate } = await import(webSrc("lib/currency/usd-to-mxn-normalize.js"));
const { pickUserGlobalSettings, composeSettings } = await import(webSrc("lib/storage/settings-scope.js"));

function resolveUsdToMxnRate(settings) {
  const dedicated = normalizeUsdToMxnRate(settings?.usdToMxnRate);
  if (dedicated != null) return dedicated;
  if (settings?.currency === "MXN") {
    const er = Number(settings?.exchangeRate);
    if (Number.isFinite(er) && er > 1) return er;
  }
  return 18;
}

function buildSettingsPayload(settings, fullName = "QA") {
  const payload = {
    ...settings,
    userName: fullName,
    exchangeRate: settings.currency === "USD" ? 1 : Number(settings.exchangeRate || 1),
    exchangeMode: settings.exchangeMode || "manual",
  };
  const normalized = normalizeUsdToMxnRate(settings?.usdToMxnRate);
  if (normalized != null) payload.usdToMxnRate = normalized;
  else delete payload.usdToMxnRate;
  return payload;
}

/** hydrate: local prefs + incoming remoto → compose vía pickUserGlobalSettings */
function hydrateMerged(localGlobals, incomingRemote) {
  const local = pickUserGlobalSettings(localGlobals);
  const remote = pickUserGlobalSettings(incomingRemote || {});
  return composeSettings({ ...local, ...remote }, {});
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// --- normalize → efectivo via resolve ---
const cases = [
  [1, 18],
  [0, 18],
  ["abc", 18],
  [null, 18],
  [17.5, 17.5],
];
for (const [raw, expected] of cases) {
  const effective = resolveUsdToMxnRate({ currency: "USD", exchangeRate: 1, usdToMxnRate: raw });
  assert(effective === expected, `raw=${JSON.stringify(raw)} → ${effective}, expected ${expected}`);
}

assert(normalizeUsdToMxnRate(1) === undefined, "normalize(1) absent");
assert(normalizeUsdToMxnRate(0) === undefined, "normalize(0) absent");
assert(normalizeUsdToMxnRate("abc") === undefined, "normalize(abc) absent");
assert(normalizeUsdToMxnRate(null) === undefined, "normalize(null) absent");
assert(normalizeUsdToMxnRate(17.5) === 17.5, "normalize(17.5) kept");

// hydrate: local=1, incoming={} → no reinfecta
const hydrated = hydrateMerged(
  { currency: "USD", exchangeRate: 1, usdToMxnRate: 1, language: "es" },
  {},
);
assert(hydrated.usdToMxnRate === undefined, `hydrate stripped local 1, got ${hydrated.usdToMxnRate}`);
assert(resolveUsdToMxnRate(hydrated) === 18, "hydrate effective 18");

const hydratedKeep = hydrateMerged(
  { currency: "USD", exchangeRate: 1, usdToMxnRate: 17.5 },
  {},
);
assert(hydratedKeep.usdToMxnRate === 17.5, "hydrate keeps 17.5");

// payload omite usdToMxnRate cuando ≤ 1
const p1 = buildSettingsPayload({ currency: "USD", exchangeRate: 1, usdToMxnRate: 1 });
assert(!Object.prototype.hasOwnProperty.call(p1, "usdToMxnRate"), "payload omits usdToMxnRate=1");
const p0 = buildSettingsPayload({ currency: "USD", exchangeRate: 1, usdToMxnRate: 0 });
assert(!Object.prototype.hasOwnProperty.call(p0, "usdToMxnRate"), "payload omits usdToMxnRate=0");
const pAbc = buildSettingsPayload({ currency: "USD", exchangeRate: 1, usdToMxnRate: "abc" });
assert(!Object.prototype.hasOwnProperty.call(pAbc, "usdToMxnRate"), "payload omits non-numeric");
const pNull = buildSettingsPayload({ currency: "USD", exchangeRate: 1, usdToMxnRate: null });
assert(!Object.prototype.hasOwnProperty.call(pNull, "usdToMxnRate"), "payload omits null");
const pOk = buildSettingsPayload({ currency: "USD", exchangeRate: 1, usdToMxnRate: 17.5 });
assert(pOk.usdToMxnRate === 17.5, "payload keeps 17.5");

// pickUserGlobalSettings strips
const picked = pickUserGlobalSettings({ usdToMxnRate: 1, currency: "USD", language: "es" });
assert(picked.usdToMxnRate === undefined, "pickUserGlobalSettings strips 1");
assert(picked.currency === "USD", "pick keeps currency");

console.log("PASS test-settings-fx-rate-warning");
