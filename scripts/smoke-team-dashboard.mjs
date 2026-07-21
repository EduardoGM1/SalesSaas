/**
 * Smoke test local del agregador del dashboard ejecutivo (sin DB).
 * node scripts/smoke-team-dashboard.mjs
 */
import {
  hasDiscoveryProgress,
  isSaleCountable,
  monthBounds,
  pctOf,
  surveyHasAnalysisData,
} from "../apps/api/src/lib/team-metrics.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const sales = [
  { status: "venta", vol: 1000, sale_date: "2026-07-10" },
  { status: "pendiente", vol: 9999, sale_date: "2026-07-11" },
  { status: "cancelada", vol: 500, sale_date: "2026-07-12" },
];
assert(isSaleCountable(sales[0]), "venta countable");
assert(!isSaleCountable(sales[1]), "pendiente no countable");
assert(!isSaleCountable(sales[2]), "cancelada no countable");

const disc = { disc_json: JSON.stringify({ answers: { q1: ["a"] } }) };
assert(hasDiscoveryProgress(disc), "discovery con respuesta");
assert(surveyHasAnalysisData({ nights: "5" }), "survey has data");
assert(pctOf(25, 100) === 25, "pctOf");

const b = monthBounds(2026, 7);
assert(b.start === "2026-07-01" && b.end === "2026-07-31", "monthBounds julio");

console.log("smoke-team-dashboard: OK");
