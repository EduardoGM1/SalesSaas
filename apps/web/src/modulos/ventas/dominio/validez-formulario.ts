import { parseMoney } from "@/lib/format/money";

/** Fecha efectiva de procesamiento para ventas pendientes. */
export function fechaProcesoVenta(saleForm: {
  status?: string;
  processDate?: string;
  date?: string;
}): string {
  if (saleForm.status !== "pendiente") return String(saleForm.processDate ?? "").trim();
  return String(saleForm.processDate ?? "").trim() || String(saleForm.date ?? "").trim();
}

export function formularioVentaValido(saleForm: {
  vol?: string;
  contract?: string;
  status?: string;
  processDate?: string;
  date?: string;
}): boolean {
  const vol = parseMoney(String(saleForm.vol ?? ""));
  if (vol <= 0 || !String(saleForm.contract ?? "").trim()) return false;
  if (saleForm.status === "pendiente" && !fechaProcesoVenta(saleForm)) return false;
  return true;
}

export {
  fechaProcesoVenta as resolveSaleProcessDate,
  formularioVentaValido as isSaleFormValid,
};
