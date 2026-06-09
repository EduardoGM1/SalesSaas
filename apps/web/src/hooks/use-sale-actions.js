import { useCallback } from "react";
import { saveClientSale } from "@/actions/sales.js";

export function useSaleActions() {
  const saveSale = useCallback((clientId, saleForm, editingSaleId) => (
    saveClientSale(clientId, saleForm, editingSaleId)
  ), []);

  return { saveSale };
}
