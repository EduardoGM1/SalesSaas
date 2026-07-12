import { clientDisplayName } from "@/lib/clients";
import { AppDatabase, CalEntry, ClientRecord, SaleRecord } from "@/lib/storage/types";

export function isSaleCountable(sale: Pick<SaleRecord, "status" | "processing"> & { tourCuantificable?: boolean }): boolean {
  if (sale.tourCuantificable === false) return false;
  return String(sale.status || "venta") !== "pendiente"
    && String(sale.processing || "venta") !== "pendiente";
}

/**
 * Tours del Dashboard: cuenta todos los tours cuantificables del mes,
 * incluyendo estado "pendiente". El volumen/ventas siguen usando isSaleCountable.
 */
export function isSaleTourCountable(sale: { tourCuantificable?: boolean }): boolean {
  return sale.tourCuantificable !== false;
}

export function findActiveClientSale(
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

/** Venta en agenda solo si sigue existiendo en un expediente activo (Clientes = fuente de verdad). */
export function isActiveAgendaSale(db: AppDatabase, entry: CalEntry): boolean {
  if (entry.t !== "venta" || entry.completed) return false;
  if (!entry.saleId) return false;
  const found = findActiveClientSale(db, entry.saleId);
  return !!found && isSaleCountable(found.sale);
}

export interface MonthSaleItem {
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

export function collectSalesForMonth(
  clients: Record<string, ClientRecord>,
  year: number,
  month: number,
): MonthSaleItem[] {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
  const items: MonthSaleItem[] = [];

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

export function collectCountableSalesForMonth(
  clients: Record<string, ClientRecord>,
  year: number,
  month: number,
): MonthSaleItem[] {
  return collectSalesForMonth(clients, year, month).filter(isSaleCountable);
}
