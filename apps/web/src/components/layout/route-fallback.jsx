import { useI18n } from "@/hooks/use-i18n.js";

export function RouteFallback() {
  const { t } = useI18n();
  return (
    <div className="sales-page" style={{ padding: 24 }}>
      <div className="page-sub">{t("common.loading")}</div>
    </div>
  );
}
