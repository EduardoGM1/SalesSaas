import { clientDisplayName } from "@/lib/clients";
import { buildSaleSnapshot } from "@/lib/sales/snapshot";
import { AppDatabase, ClientRecord, SaleRecord } from "@/lib/storage/types";

export interface SaleListItem extends SaleRecord {
  clientName?: string;
  prospectCode?: string;
  clientId?: string;
  formerClientId?: string;
}

export interface SalesFilter {
  status?: string;
  processing?: string;
  from?: string;
  to?: string;
}

export function collectAllSales(db: AppDatabase): SaleListItem[] {
  const items: SaleListItem[] = [];

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

export function filterSales(items: SaleListItem[], filters: SalesFilter): SaleListItem[] {
  return items.filter((sale) => {
    if (filters.status && sale.status !== filters.status) return false;
    if (filters.processing && sale.processing !== filters.processing) return false;
    if (filters.from && (sale.date || "") < filters.from) return false;
    if (filters.to && (sale.date || "") > filters.to) return false;
    return true;
  });
}

export function countAllSales(db: AppDatabase): number {
  let n = Object.values(db.sales ?? {}).length;
  for (const client of Object.values(db.clients)) {
    n += (client.sales ?? []).length;
  }
  return n;
}

function enrichSale(sale: SaleRecord, client?: ClientRecord): SaleListItem {
  const item: SaleListItem = {
    ...sale,
    clientName: sale.clientName || (client ? clientDisplayName(client) : undefined),
    prospectCode: sale.prospectCode || client?.prospectCode,
    clientId: client && "id" in client ? client.id : sale.formerClientId,
  };
  if (client && !sale.snapshot?.tools?.survey && !sale.snapshot?.tools?.worksheet) {
    item.snapshot = sale.snapshot || buildSaleSnapshot(client);
  }
  return item;
}

export function findSaleById(db: AppDatabase, saleId: string): SaleListItem | undefined {
  if (!saleId) return undefined;
  for (const client of Object.values(db.clients)) {
    const sale = (client.sales ?? []).find((s) => s.saleId === saleId);
    if (sale) return enrichSale(sale, client);
  }
  const archived = db.sales?.[saleId];
  if (archived) return enrichSale(archived);
  return undefined;
}
