import { useI18n } from "@/hooks/use-i18n.js";

export function SharedToolBanner({ show }) {
  const { t } = useI18n();
  if (!show) return null;
  return (
    <div className="shared-tool-readonly-banner" role="status">
      {t("network.sharedReadOnlyHint")}
    </div>
  );
}
