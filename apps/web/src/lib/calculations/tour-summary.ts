import { isSaleCountable } from "@/lib/sales/agenda-sales";
import { ClientRecord } from "@/lib/storage/types";

export type TourTypeCounts = { yes: number; no: number };
export type TourTypeSummary = Record<string, TourTypeCounts>;

/**
 * Misma regla que "Resumen de tipo tours":
 * cuenta expedientes con tipo_tour; yes = cuantificable, no = no cuantificable.
 */
export function isTourSummaryClient(c: ClientRecord): boolean {
  return !!c.tipo_tour;
}

/** Expediente que suma en la columna "Sí" (cuantificable) del resumen. */
export function isQuantifiableTourClient(c: ClientRecord): boolean {
  return isTourSummaryClient(c) && c.tour_cuantificable !== false;
}

/** Fuente única del resumen por tipo de tour. */
export function buildTourTypeSummary(
  clients: Record<string, ClientRecord>,
  tourTypes: string[] = [],
): TourTypeSummary {
  const map: TourTypeSummary = {};
  for (const type of tourTypes) {
    map[type] = { yes: 0, no: 0 };
  }
  for (const c of Object.values(clients)) {
    if (!isTourSummaryClient(c)) continue;
    const type = c.tipo_tour as string;
    if (!map[type]) map[type] = { yes: 0, no: 0 };
    if (c.tour_cuantificable !== false) map[type].yes++;
    else map[type].no++;
  }
  return map;
}

/** Suma de cuantificables = recuadro Tours en Datos de producción. */
export function countQuantifiableTours(summary: TourTypeSummary): number {
  return Object.values(summary).reduce((sum, row) => sum + (row.yes || 0), 0);
}

/**
 * Expediente cuantificable con al menos una venta registrada (no pendiente).
 * No puede contar como venta si no es cuantificable.
 */
export function isQuantifiableSaleClient(c: ClientRecord): boolean {
  if (!isQuantifiableTourClient(c)) return false;
  return (c.sales ?? []).some((sale) =>
    isSaleCountable({ ...sale, tourCuantificable: c.tour_cuantificable }),
  );
}

/** Recuadro Ventas: subconjunto de cuantificables con venta. */
export function countQuantifiableSales(clients: Record<string, ClientRecord>): number {
  return Object.values(clients).filter(isQuantifiableSaleClient).length;
}

export function productionTourSaleCounts(
  clients: Record<string, ClientRecord>,
  tourTypes: string[] = [],
): { tours: number; sales: number; summary: TourTypeSummary } {
  const summary = buildTourTypeSummary(clients, tourTypes);
  return {
    summary,
    tours: countQuantifiableTours(summary),
    sales: countQuantifiableSales(clients),
  };
}
