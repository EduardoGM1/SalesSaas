/**
 * Cola de sale-bundles diferidos mientras cloud-persist está suspendido
 * (replaceDb / realtime / runWithoutOutboundSync).
 */
export function createDeferredSaleBundles() {
  /** @type {Map<string, { clientId: string, saleId: string }>} */
  const pending = new Map();

  return {
    queue(clientId, saleId) {
      if (!clientId || !saleId) return;
      pending.set(`${clientId}:${saleId}`, { clientId, saleId });
    },
    flush(scheduleSaleBundle) {
      if (!pending.size) return 0;
      const items = [...pending.values()];
      pending.clear();
      for (const { clientId, saleId } of items) {
        scheduleSaleBundle(clientId, saleId);
      }
      return items.length;
    },
    size() {
      return pending.size;
    },
    clear() {
      pending.clear();
    },
  };
}
