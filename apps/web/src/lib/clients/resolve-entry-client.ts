import { findSaleById } from "@/lib/sales/collect";
import { AppDatabase } from "@/lib/storage/types";

type EntryLike = {
  clientId?: string;
  prospectId?: string;
  saleId?: string;
};

/** Resuelve el id de expediente vinculado a una entrada de agenda. */
export function resolveEntryClientId(db: AppDatabase, entry: EntryLike): string | null {
  const tryId = (id?: string) => (id && db.clients[id] ? id : null);

  const direct = tryId(entry.clientId) || tryId(entry.prospectId);
  if (direct) return direct;

  if (entry.saleId) {
    const sale = findSaleById(db, entry.saleId);
    return tryId(sale?.clientId) || tryId(sale?.formerClientId) || null;
  }

  return null;
}
