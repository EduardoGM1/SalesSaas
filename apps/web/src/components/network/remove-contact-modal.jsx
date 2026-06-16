
import { SalesModal } from "@/components/ui/sales-modal";
import { useI18n } from "@/hooks/use-i18n.js";

function displayName(user) {
  return user?.full_name?.trim() || user?.email?.split("@")[0] || "Usuario";
}

export function RemoveContactModal({ open, onOpenChange, contact, onConfirm, pending }) {
  const { t } = useI18n();
  const name = displayName(contact);

  return (
    <SalesModal
      open={open}
      onOpenChange={onOpenChange}
      title={t("network.removeModalTitle", { name })}
      maxWidth={480}
    >
      <p className="modal-body-text">{t("network.removeModalBody")}</p>
      <div className="btn-row">
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </button>
        <button type="button" className="btn btn-danger" disabled={pending} onClick={onConfirm}>
          {t("network.removeConfirm")}
        </button>
      </div>
    </SalesModal>
  );
}
