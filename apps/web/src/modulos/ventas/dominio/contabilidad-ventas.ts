import { clientDisplayName } from "@/lib/clients";
import { AppDatabase, CalEntry, ClientRecord, SaleRecord } from "@/lib/storage/types";

export function ventaCancelada(sale: Pick<SaleRecord, "status"> | null | undefined): boolean {
  return String(sale?.status || "") === "cancelada";
}

/** Totales Dashboard/producción: excluye pendiente y cancelada (sin saldos negativos). */
export function ventaContable(sale: Pick<SaleRecord, "status" | "processing"> & { tourCuantificable?: boolean }): boolean {
  if (sale.tourCuantificable === false) return false;
  if (ventaCancelada(sale)) return false;
  return String(sale.status || "venta") !== "pendiente"
    && String(sale.processing || "venta") !== "pendiente";
}

/**
 * Tours del Dashboard: cuenta todos los tours cuantificables del mes,
 * incluyendo estado "pendiente". El volumen sigue usando ventaContable.
 */
export function tourDeVentaContable(sale: { tourCuantificable?: boolean }): boolean {
  return sale.tourCuantificable !== false;
}

export function buscarVentaActivaEnCliente(
  db: AppDatabase,
  saleId: string,
): { sale: SaleRecord; client: ClientRecord } | undefined {
  if (!saleId) return undefined;
  for (const client of Object.values(db.clients)) {
    const sale = (client.sales ?? []).find((item) => item.saleId === saleId);
    if (sale) return { sale, client };
  }
  return undefined;
}

/** Venta visible en Agenda: contable o cancelada. Pendiente no aparece como venta. */
export function ventaActivaEnAgenda(db: AppDatabase, entry: CalEntry): boolean {
  if (entry.t !== "venta" || entry.completed) return false;
  if (!entry.saleId) return false;
  const found = buscarVentaActivaEnCliente(db, entry.saleId);
  if (!found) return false;
  if (ventaCancelada(found.sale)) return true;
  return ventaContable(found.sale);
}

/** Color de la entrada: estado actual de la venta en el expediente. */
export function ventaCanceladaEnAgenda(db: AppDatabase, entry: CalEntry): boolean {
  if (entry.t !== "venta" || !entry.saleId) return false;
  const found = buscarVentaActivaEnCliente(db, entry.saleId);
  return !!found && ventaCancelada(found.sale);
}

export interface VentaDelMes {
  saleId: string;
  vol: number;
  tours: number;
  contract?: string;
  clientName?: string;
  note?: string;
  day: number;
  date: string;
  status?: string;
  processing?: string;
  tourCuantificable?: boolean;
}

export function ventasDelMes(
  clients: Record<string, ClientRecord>,
  year: number,
  month: number,
): VentaDelMes[] {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
  const items: VentaDelMes[] = [];

  for (const client of Object.values(clients)) {
    for (const sale of client.sales ?? []) {
      if (!sale.date?.startsWith(prefix)) continue;
      const day = Number(sale.date.slice(prefix.length));
      if (!day) continue;
      items.push({
        saleId: sale.saleId,
        vol: sale.vol || 0,
        tours: sale.tours || 1,
        contract: sale.contract,
        clientName: clientDisplayName(client),
        note: sale.note,
        day,
        date: sale.date,
        status: sale.status,
        processing: sale.processing,
        tourCuantificable: client.tour_cuantificable,
      });
    }
  }

  return items;
}

export function ventasContablesDelMes(
  clients: Record<string, ClientRecord>,
  year: number,
  month: number,
): VentaDelMes[] {
  return ventasDelMes(clients, year, month).filter(ventaContable);
}

export {
  ventaCancelada as isSaleCancelled,
  ventaContable as isSaleCountable,
  tourDeVentaContable as isSaleTourCountable,
  ventaActivaEnAgenda as isActiveAgendaSale,
  ventaCanceladaEnAgenda as isCancelledAgendaSale,
  ventasDelMes as collectSalesForMonth,
  ventasContablesDelMes as collectCountableSalesForMonth,
};
