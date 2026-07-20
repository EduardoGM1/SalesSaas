import { isSaleCountable } from "@/lib/sales/agenda-sales";
import { ClientRecord } from "@/lib/storage/types";

export type TourTypeCounts = { yes: number; no: number };
export type TourTypeSummary = Record<string, TourTypeCounts>;

/** Prefijo YYYY-MM- para rango [inicioMes, inicioMesSiguiente). */
export function monthDatePrefix(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-`;
}

export function isYmdInMonth(ymd: string | undefined | null, year: number, month: number): boolean {
  if (!ymd) return false;
  return String(ymd).startsWith(monthDatePrefix(year, month));
}

/** Fecha del tour usada en Dashboard/Clientes. */
export function clientTourDate(c: ClientRecord): string {
  return c.tourDate || c.createdYmd || "";
}

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

type MonthFilter = { year: number; month: number } | null | undefined;

function matchesTourMonth(c: ClientRecord, monthFilter: MonthFilter): boolean {
  if (!monthFilter) return true;
  return isYmdInMonth(clientTourDate(c), monthFilter.year, monthFilter.month);
}

/** ¿Tiene al menos una venta contable con sale.date en el mes? (misma fecha que volumen del Dashboard). */
export function hasCountableSaleInMonth(
  c: ClientRecord,
  year: number,
  month: number,
): boolean {
  return (c.sales ?? []).some((sale) => {
    if (!isYmdInMonth(sale.date, year, month)) return false;
    return isSaleCountable({ ...sale, tourCuantificable: c.tour_cuantificable });
  });
}

/** Fuente única del resumen por tipo de tour (opcionalmente filtrado por mes del tour). */
export function buildTourTypeSummary(
  clients: Record<string, ClientRecord>,
  tourTypes: string[] = [],
  monthFilter?: MonthFilter,
): TourTypeSummary {
  const map: TourTypeSummary = {};
  for (const type of tourTypes) {
    map[type] = { yes: 0, no: 0 };
  }
  for (const c of Object.values(clients)) {
    if (!isTourSummaryClient(c)) continue;
    if (!matchesTourMonth(c, monthFilter)) continue;
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
 * Sin mes: cualquier venta contable. Con mes: venta con sale.date en ese mes.
 */
export function isQuantifiableSaleClient(
  c: ClientRecord,
  monthFilter?: MonthFilter,
): boolean {
  if (!isQuantifiableTourClient(c)) return false;
  if (monthFilter) {
    return hasCountableSaleInMonth(c, monthFilter.year, monthFilter.month);
  }
  return (c.sales ?? []).some((sale) =>
    isSaleCountable({ ...sale, tourCuantificable: c.tour_cuantificable }),
  );
}

/** Recuadro Ventas: subconjunto de cuantificables con venta (opcionalmente del mes). */
export function countQuantifiableSales(
  clients: Record<string, ClientRecord>,
  monthFilter?: MonthFilter,
): number {
  return Object.values(clients).filter((c) => isQuantifiableSaleClient(c, monthFilter)).length;
}

/**
 * Tours/Ventas de producción. Si se pasan year/month, filtra estricto por periodo
 * [inicioMes, inicioMesSiguiente) — Tours por fecha del tour, Ventas por sale.date.
 */
export function productionTourSaleCounts(
  clients: Record<string, ClientRecord>,
  tourTypes: string[] = [],
  year?: number,
  month?: number,
): { tours: number; sales: number; summary: TourTypeSummary } {
  const monthFilter =
    Number.isInteger(year) && Number.isInteger(month)
      ? { year: year as number, month: month as number }
      : undefined;
  const summary = buildTourTypeSummary(clients, tourTypes, monthFilter);
  return {
    summary,
    tours: countQuantifiableTours(summary),
    sales: countQuantifiableSales(clients, monthFilter),
  };
}
