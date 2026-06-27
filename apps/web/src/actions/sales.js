import { parseMoney } from "@/lib/format/money";
import { translate } from "@/lib/i18n.js";
import { resolveSaleProcessDate } from "@/lib/sales/form-valid";
import { useDbStore } from "@/stores/db-store";
import { toast } from "@/lib/toast";

export function validateSaleForm(saleForm) {
  const vol = parseMoney(saleForm.vol);
  if (vol <= 0 || !String(saleForm.contract ?? "").trim()) {
    toast.error(translate("toast.sale.incomplete"));
    return null;
  }
  const processDate = resolveSaleProcessDate(saleForm);
  if (saleForm.status === "pendiente" && !processDate) {
    toast.error(translate("toast.sale.needProcessDate"));
    return null;
  }
  return {
    date: saleForm.date,
    vol,
    tours: parseMoney(saleForm.tours) || 1,
    contract: saleForm.contract,
    status: saleForm.status,
    processDate: saleForm.status === "pendiente" ? processDate : "",
    note: saleForm.note,
    addProcessingFollowup: saleForm.addProcessingFollowup,
  };
}

export function saveClientSale(clientId, saleForm, editingSaleId) {
  const payload = validateSaleForm(saleForm);
  if (!payload) return { ok: false };
  const store = useDbStore.getState();
  if (editingSaleId) store.updateClientSale(clientId, editingSaleId, payload);
  else store.registerClientSale(clientId, payload);
  const message = saleForm.status === "pendiente"
    ? translate("toast.sale.pendingSaved")
    : translate("toast.sale.saved");
  toast.success(message);
  return { ok: true, message };
}
