/**
 * Validación del caso Dashboard: 4 cuantificables → Tours=4; 1 venta → Ventas=1.
 * Espejo de apps/web/src/lib/calculations/tour-summary.ts (misma regla).
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

function isTourSummaryClient(c) {
  return !!c.tipo_tour;
}

function isQuantifiableTourClient(c) {
  return isTourSummaryClient(c) && c.tour_cuantificable !== false;
}

function buildTourTypeSummary(clients, tourTypes = []) {
  const map = {};
  for (const type of tourTypes) map[type] = { yes: 0, no: 0 };
  for (const c of Object.values(clients)) {
    if (!isTourSummaryClient(c)) continue;
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

function countQuantifiableSales(clients) {
  return Object.values(clients).filter((c) => {
    if (!isQuantifiableTourClient(c)) return false;
    return (c.sales ?? []).some((sale) =>
      isSaleCountable({ ...sale, tourCuantificable: c.tour_cuantificable }),
    );
  }).length;
}

const tourTypes = ["OFV", "OPV", "InHouse"];
const clients = {
  a: { id: "a", tipo_tour: "OFV", tour_cuantificable: true, sales: [] },
  b: {
    id: "b",
    tipo_tour: "OPV",
    tour_cuantificable: true,
    sales: [{ saleId: "s0", status: "pendiente", processing: "pendiente", vol: 1000 }],
  },
  c: { id: "c", tipo_tour: "InHouse", tour_cuantificable: true, sales: [] },
  d: {
    id: "d",
    tipo_tour: "OFV",
    tour_cuantificable: true,
    sales: [
      { saleId: "s1", status: "venta", processing: "venta", vol: 25000 },
      { saleId: "s1c", status: "cancelada", processing: "venta", vol: 25000 },
    ],
  },
  e: {
    id: "e",
    tipo_tour: "OFV",
    tour_cuantificable: false,
    sales: [{ saleId: "s2", status: "venta", processing: "venta", vol: 99000 }],
  },
  f: {
    id: "f",
    tour_cuantificable: true,
    sales: [{ saleId: "s3", status: "venta", processing: "venta", vol: 100 }],
  },
};

const summary = buildTourTypeSummary(clients, tourTypes);
const tours = countQuantifiableTours(summary);
const sales = countQuantifiableSales(clients);

assert.equal(tours, 4, "Tours = 4 cuantificables");
assert.equal(sales, 1, "Ventas = 1 (cuantificable con venta $25,000; cancelada no suma)");
assert.equal(isSaleCountable({ status: "cancelada", processing: "venta" }), false, "cancelada no es countable");
assert.equal(
  Object.values(summary).reduce((a, r) => a + r.yes, 0),
  tours,
  "Tours == suma columna Sí del resumen",
);

console.log("ok: validate-tour-summary (4 tours / 1 venta; cancelada excluida)");
