import { parseMoney } from "@/lib/format/money";
import { translate } from "@/lib/i18n.js";
import { useDbStore } from "@/stores/db-store";
import { toast } from "@/lib/toast";

export function validateSaleForm(saleForm) {
  const vol = parseMoney(saleForm.vol);
  if (vol <= 0 || !saleForm.contract) {
    toast.error(translate("toast.sale.incomplete"));
    return null;
  }
  if (saleForm.status === "no-procesable" && !saleForm.processDate) {
    toast.error(translate("toast.sale.needProcessDate"));
    return null;
  }
  return {
    date: saleForm.date,
    vol,
    tours: parseMoney(saleForm.tours) || 1,
    contract: saleForm.contract,
    status: saleForm.status,
    processDate: saleForm.processDate,
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
  const message = saleForm.status === "no-procesable"
    ? translate("toast.sale.pendingSaved")
    : translate("toast.sale.saved");
  toast.success(message);
  return { ok: true, message };
}
