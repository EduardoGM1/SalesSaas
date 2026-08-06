/**
 * Validación Dashboard Tours/Ventas.
 * Espejo de apps/web/src/lib/calculations/tour-summary.ts
 *
 * Ejecutar: node scripts/validate-tour-summary.mjs
 */
import assert from "node:assert/strict";

function isSaleCancelled(sale) {
  return String(sale?.status || "") === "cancelada";
}

function isSaleCountable(sale) {
  if (sale.tourCuantificable === false) return false;
  if (isSaleCancelled(sale)) return false;
  return String(sale.status || "venta") !== "pendiente"
    && String(sale.processing || "venta") !== "pendiente";
}

function monthDatePrefix(year, month) {
  return `${year}-${String(month + 1).padStart(2, "0")}-`;
}

function isYmdInMonth(ymd, year, month) {
  if (!ymd) return false;
  return String(ymd).startsWith(monthDatePrefix(year, month));
}

function clientTourDate(c) {
  return c.tourDate || c.createdYmd || "";
}

function isTourSummaryClient(c) {
  return !!c.tipo_tour;
}

function isQuantifiableTourClient(c) {
  return isTourSummaryClient(c) && c.tour_cuantificable !== false;
}

function buildTourTypeSummary(clients, tourTypes = [], monthFilter) {
  const map = {};
  for (const type of tourTypes) map[type] = { yes: 0, no: 0 };
  for (const c of Object.values(clients)) {
    if (!isTourSummaryClient(c)) continue;
    if (monthFilter && !isYmdInMonth(clientTourDate(c), monthFilter.year, monthFilter.month)) continue;
    const type = c.tipo_tour;
    if (!map[type]) map[type] = { yes: 0, no: 0 };
    if (c.tour_cuantificable !== false) map[type].yes++;
    else map[type].no++;
  }
  return map;
}

function countQuantifiableTours(summary) {
  return Object.values(summary).reduce((sum, row) => sum + (row.yes || 0), 0);
}

function hasCountableSaleInMonth(c, year, month) {
  return (c.sales ?? []).some((sale) => {
    if (!isYmdInMonth(sale.date, year, month)) return false;
    return isSaleCountable({ ...sale, tourCuantificable: c.tour_cuantificable });
  });
}

function countQuantifiableSales(clients, monthFilter) {
  return Object.values(clients).filter((c) => {
    if (!isQuantifiableTourClient(c)) return false;
    if (monthFilter) return hasCountableSaleInMonth(c, monthFilter.year, monthFilter.month);
    return (c.sales ?? []).some((sale) =>
      isSaleCountable({ ...sale, tourCuantificable: c.tour_cuantificable }),
    );
  }).length;
}

function productionTourSaleCounts(clients, tourTypes = [], year, month) {
  const monthFilter =
    Number.isInteger(year) && Number.isInteger(month) ? { year, month } : undefined;
  const summary = buildTourTypeSummary(clients, tourTypes, monthFilter);
  return {
    summary,
    tours: countQuantifiableTours(summary),
    sales: countQuantifiableSales(clients, monthFilter),
  };
}

const tourTypes = ["OFV", "OPV", "InHouse"];
const clients = {
  a: { id: "a", tipo_tour: "OFV", tour_cuantificable: true, tourDate: "2026-06-02", sales: [] },
  b: {
    id: "b",
    tipo_tour: "OPV",
    tour_cuantificable: true,
    tourDate: "2026-06-10",
    sales: [{ saleId: "s0", status: "pendiente", processing: "pendiente", vol: 1000, date: "2026-06-10" }],
  },
  c: { id: "c", tipo_tour: "InHouse", tour_cuantificable: true, tourDate: "2026-06-15", sales: [] },
  d: {
    id: "d",
    tipo_tour: "OFV",
    tour_cuantificable: true,
    tourDate: "2026-06-20",
    sales: [
      { saleId: "s1", status: "venta", processing: "venta", vol: 25000, date: "2026-06-21" },
      { saleId: "s1c", status: "cancelada", processing: "venta", vol: 25000, date: "2026-06-21" },
    ],
  },
  e: {
    id: "e",
    tipo_tour: "OFV",
    tour_cuantificable: false,
    tourDate: "2026-06-22",
    sales: [{ saleId: "s2", status: "venta", processing: "venta", vol: 99000, date: "2026-06-22" }],
  },
  f: {
    id: "f",
    tour_cuantificable: true,
    tourDate: "2026-06-01",
    sales: [{ saleId: "s3", status: "venta", processing: "venta", vol: 100, date: "2026-06-01" }],
  },
  g: {
    id: "g",
    tipo_tour: "OFV",
    tour_cuantificable: true,
    tourDate: "2026-07-03",
    sales: [{ saleId: "s4", status: "venta", processing: "venta", vol: 5000, date: "2026-07-04" }],
  },
  h: {
    id: "h",
    tipo_tour: "OPV",
    tour_cuantificable: true,
    tourDate: "2026-07-08",
    sales: [],
  },
};

const global = productionTourSaleCounts(clients, tourTypes);
assert.equal(global.tours, 6, "Global: 6 cuantificables con tipo_tour");
assert.equal(global.sales, 2, "Global: d + g con venta contable");

const june = productionTourSaleCounts(clients, tourTypes, 2026, 5); // month 0-index: 5 = junio
assert.equal(june.tours, 4, "Junio: tours a,b,c,d (e no cuantificable; g/h julio)");
assert.equal(june.sales, 1, "Junio: solo d con venta contable en junio");

const july = productionTourSaleCounts(clients, tourTypes, 2026, 6);
assert.equal(july.tours, 2, "Julio: tours g,h");
assert.equal(july.sales, 1, "Julio: solo g con venta en julio");
assert.notEqual(june.tours, july.tours, "Cambiar de mes actualiza Tours");
assert.notEqual(june.tours, global.tours, "Junio no reutiliza el total global de Tours");
assert.notEqual(july.tours, global.tours, "Julio no reutiliza el total global de Tours");

assert.equal(isSaleCountable({ status: "cancelada", processing: "venta" }), false, "cancelada no es countable");

console.log("ok: validate-tour-summary (filtro mensual Tours/Ventas)");
