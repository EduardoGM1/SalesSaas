import { parseMoney } from "@/lib/format/money";

export function isSaleFormValid(saleForm: {
  vol?: string;
  contract?: string;
  status?: string;
  processDate?: string;
}): boolean {
  const vol = parseMoney(String(saleForm.vol ?? ""));
  if (vol <= 0 || !String(saleForm.contract ?? "").trim()) return false;
  if (saleForm.status === "no-procesable" && !saleForm.processDate) return false;
  return true;
}
