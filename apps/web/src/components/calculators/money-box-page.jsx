import { Navigate } from "react-router-dom";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back.jsx";
import { CalcCardSkeleton } from "@/components/ui/content-skeleton.jsx";
import { useFeatureAccess } from "@/hooks/use-feature-access.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { MoneyBoxCalculator } from "@/components/calculators/money-box-calculator.jsx";
import { useDbStore } from "@/stores/db-store";
import { shallow } from "zustand/shallow";

export function MoneyBoxPage({ clientId, shared }) {
  const { t } = useI18n();
  const { allowed, locked, loading, ready } = useFeatureAccess("money_box");
  const worksheetConfig = useDbStore((s) => s.db.settings?.worksheetConfig, shallow);
  const moneyBoxConfig = useDbStore((s) => s.db.settings?.moneyBoxConfig, shallow);

  const backHref = shared?.contactId && shared?.prospectId
    ? `/red/contacto/${shared.contactId}/expediente/${shared.prospectId}`
    : clientId
      ? `/clients/${clientId}`
      : "/tools";

  if (loading || !ready) {
    return (
      <>
        <Topbar title={t("moneyBox.title")} subtitle={t("moneyBox.subtitle")} />
        <div className="sales-page tool-calc-page" aria-busy="true">
          <div className="page-toolbar">
            <PageBack inline href={backHref} fallback={backHref} />
          </div>
          <CalcCardSkeleton rows={3} boxes={2} />
          <div style={{ marginTop: 12 }}><CalcCardSkeleton rows={4} boxes={0} /></div>
        </div>
      </>
    );
  }

  if (locked || !allowed) {
    return <Navigate to={backHref} replace />;
  }

  return (
    <>
      <Topbar title={t("moneyBox.title")} subtitle={t("moneyBox.subtitle")} />
      <div className="sales-page tool-calc-page">
        <div className="page-toolbar">
          <PageBack inline href={backHref} fallback={backHref} />
        </div>
        <MoneyBoxCalculator
          worksheetConfig={worksheetConfig}
          savedRestrictions={moneyBoxConfig}
        />
      </div>
    </>
  );
}
