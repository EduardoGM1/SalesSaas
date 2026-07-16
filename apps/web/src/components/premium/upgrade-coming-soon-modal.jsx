import { SalesModal } from "@/components/ui/sales-modal";
import { useI18n } from "@/hooks/use-i18n.js";

export function UpgradeComingSoonModal({ open, onOpenChange, featureName }) {
  const { t } = useI18n();
  return (
    <SalesModal
      open={open}
      onOpenChange={onOpenChange}
      title={t("premium.upgrade.title")}
      sub={featureName || t("premium.upgrade.featureFallback")}
    >
      <p className="premium-upgrade-body">{t("premium.upgrade.body")}</p>
      <p className="premium-upgrade-hint">{t("premium.upgrade.hint")}</p>
      <div className="btn-row" style={{ marginTop: 16 }}>
        <button type="button" className="btn btn-primary" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </button>
      </div>
    </SalesModal>
  );
}
