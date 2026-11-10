import { useCallback } from "react";
import { saveClientSale } from "../servicios/acciones-venta.js";

export function useSaleActions() {
  const saveSale = useCallback((clientId, saleForm, editingSaleId) => (
    saveClientSale(clientId, saleForm, editingSaleId)
  ), []);

  return { saveSale };
}
