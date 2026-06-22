import { parseMoney } from "@/lib/format/money";

/** Fecha efectiva de procesamiento para ventas no procesables. */
export function resolveSaleProcessDate(saleForm: {
  status?: string;
  processDate?: string;
  date?: string;
}): string {
  if (saleForm.status !== "no-procesable") return String(saleForm.processDate ?? "").trim();
  return String(saleForm.processDate ?? "").trim() || String(saleForm.date ?? "").trim();
}

export function isSaleFormValid(saleForm: {
  vol?: string;
  contract?: string;
  status?: string;
  processDate?: string;
  date?: string;
}): boolean {
  const vol = parseMoney(String(saleForm.vol ?? ""));
  if (vol <= 0 || !String(saleForm.contract ?? "").trim()) return false;
  if (saleForm.status === "no-procesable" && !resolveSaleProcessDate(saleForm)) return false;
  return true;
}
