import { clientDisplayName } from "@/lib/clients";
import { AppDatabase, ClientRecord, SaleRecord } from "@/lib/storage/types";
import { construirInstantaneaVenta } from "./instantanea-venta";

export interface ElementoListaVenta extends SaleRecord {
  clientName?: string;
  prospectCode?: string;
  clientId?: string;
  formerClientId?: string;
}

export interface FiltroVentas {
  status?: string;
  processing?: string;
  from?: string;
  to?: string;
}

export function recopilarVentas(db: AppDatabase): ElementoListaVenta[] {
  const items: ElementoListaVenta[] = [];

  for (const client of Object.values(db.clients)) {
    for (const sale of client.sales ?? []) {
      items.push({
        ...sale,
        clientName: clientDisplayName(client),
        prospectCode: client.prospectCode,
        clientId: client.id,
      });
    }
  }

  for (const sale of Object.values(db.sales ?? {})) {
    items.push({ ...sale });
  }

  return items.sort((a, b) => {
    const byDate = (b.date || "").localeCompare(a.date || "");
    return byDate !== 0 ? byDate : (b.ts || 0) - (a.ts || 0);
  });
}

export function filtrarVentas(items: ElementoListaVenta[], filters: FiltroVentas): ElementoListaVenta[] {
  return items.filter((sale) => {
    if (filters.status && sale.status !== filters.status) return false;
    if (filters.processing && sale.processing !== filters.processing) return false;
    if (filters.from && (sale.date || "") < filters.from) return false;
    if (filters.to && (sale.date || "") > filters.to) return false;
    return true;
  });
}

export function contarVentas(db: AppDatabase): number {
  let n = Object.values(db.sales ?? {}).length;
  for (const client of Object.values(db.clients)) {
    n += (client.sales ?? []).length;
  }
  return n;
}

function enriquecerVenta(sale: SaleRecord, client?: ClientRecord): ElementoListaVenta {
  const item: ElementoListaVenta = {
    ...sale,
    clientName: sale.clientName || (client ? clientDisplayName(client) : undefined),
    prospectCode: sale.prospectCode || client?.prospectCode,
    clientId: client && "id" in client ? client.id : sale.formerClientId,
  };
  if (client && !sale.snapshot?.tools?.survey && !sale.snapshot?.tools?.worksheet) {
    item.snapshot = sale.snapshot || construirInstantaneaVenta(client);
  }
  return item;
}

export function buscarVentaPorId(db: AppDatabase, saleId: string): ElementoListaVenta | undefined {
  if (!saleId) return undefined;
  for (const client of Object.values(db.clients)) {
    const sale = (client.sales ?? []).find((s) => s.saleId === saleId);
    if (sale) return enriquecerVenta(sale, client);
  }
  const archived = db.sales?.[saleId];
  if (archived) return enriquecerVenta(archived);
  return undefined;
}

export {
  recopilarVentas as collectAllSales,
  filtrarVentas as filterSales,
  contarVentas as countAllSales,
  buscarVentaPorId as findSaleById,
};
