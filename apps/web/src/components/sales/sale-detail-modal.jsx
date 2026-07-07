import { useMemo } from "react";
import { SalesModal } from "@/components/ui/sales-modal";
import { computeSurvey, surveyHasData } from "@/lib/calculations/survey";
import { computeVacaciones } from "@/lib/calculations/vacaciones";
import { worksheetDisplayEntries } from "@/lib/calculations/worksheet-labels";
import { longDate } from "@/lib/format/dates";
import { statusLabel } from "@/lib/format/status";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";
import { useDbStore } from "@/stores/db-store";
import { findSaleById } from "@/lib/sales/collect";
import { shallow } from "zustand/shallow";

const SURVEY_ROW_KEYS = [
  "tools.survey.pattern.current",
  "tools.survey.pattern.hist",
  "tools.survey.pattern.future",
  "tools.survey.pattern.blend",
];

function DetailRow({ label, value }) {
  if (value == null || value === "") return null;
  return (
    <div className="sale-detail-row">
      <div className="sale-detail-label">{label}</div>
      <div className="sale-detail-value">{value}</div>
    </div>
  );
}

function ToolSection({ title, children, empty }) {
  const { t } = useI18n();
  return (
    <div className="sale-detail-section">
      <div className="sale-detail-heading">{title}</div>
      {empty ? <div className="activity-empty">{t("saleDetail.noData")}</div> : children}
    </div>
  );
}

export function SaleDetailModal({ open, onOpenChange, saleId, showTools = true }) {
  const { t, lang } = useI18n();
  const { fmt, fmtD, fmtN } = useMoney();
  const db = useDbStore((s) => s.db, shallow);
  const sale = useMemo(() => (saleId ? findSaleById(db, saleId) : undefined), [db, saleId]);

  const snapshot = sale?.snapshot;
  const survey = (snapshot?.tools?.survey || {}) as Record<string, string>;
  const vacaciones = snapshot?.tools?.vacaciones || {};
  const worksheet = snapshot?.tools?.worksheet || {};
  const surveyResult = useMemo(
    () => computeSurvey(survey, String(survey.stype || "hotel")),
    [survey, db.settings?.currency, db.settings?.exchangeRate, db.settings?.language],
  );
  const vacResult = useMemo(() => computeVacaciones(vacaciones), [vacaciones]);
  const worksheetRows = useMemo(() => worksheetDisplayEntries(worksheet), [worksheet]);

  if (!sale) return null;

  const pending = sale.status === "pendiente" || sale.processing === "pendiente";
  const fileLabel = sale.clientName || sale.prospectCode || t("salesHistory.archivedFile");
  const summary = snapshot?.prospectSummary || {};
  const displayName = summary.name1 || summary.name || fileLabel;

  const surveyRows = surveyHasData(survey) ? [
    { label: t(SURVEY_ROW_KEYS[0]), vac: String(surveyResult.current.vac), night: fmtD(surveyResult.current.night), dp: fmt(surveyResult.current.dp), mi: fmt(surveyResult.current.mi) },
    { label: t(SURVEY_ROW_KEYS[1]), vac: fmtD(surveyResult.hist.vac), night: fmtD(surveyResult.hist.night), dp: fmt(surveyResult.hist.dp), mi: fmt(surveyResult.hist.mi) },
    { label: t(SURVEY_ROW_KEYS[2]), vac: fmtD(surveyResult.future.vac), night: fmtD(surveyResult.future.night), dp: fmt(surveyResult.future.dp), mi: fmt(surveyResult.future.mi) },
    { label: t(SURVEY_ROW_KEYS[3]), vac: fmtD(surveyResult.pattern.vac), night: fmtD(surveyResult.pattern.night), dp: fmt(surveyResult.pattern.dp), mi: fmt(surveyResult.pattern.mi) },
  ] : [];

  return (
    <SalesModal
      open={open}
      onOpenChange={onOpenChange}
      title={t("saleDetail.title")}
      sub={t("saleDetail.sub", { name: displayName, date: sale.date ? longDate(sale.date, lang) : "—" })}
      maxWidth={820}
    >
      <div className="sale-detail-body">
        <ToolSection title={t("saleDetail.saleInfo")}>
          <p className="sale-detail-hint">{t("saleDetail.readOnly")}</p>
          <div className="prospect-summary-list">
            <DetailRow label={t("admin.table.date")} value={sale.date ? longDate(sale.date, lang) : "—"} />
            <DetailRow label={t("admin.table.file")} value={fileLabel} />
            <DetailRow label={t("admin.table.contract")} value={sale.contract} />
            <DetailRow label={t("admin.table.status")} value={statusLabel(sale.status, lang)} />
            <DetailRow label={t("salesHistory.filters.processing")} value={pending ? t("exp.sales.pending") : t("salesHistory.filters.processable")} />
            <DetailRow label={t("admin.table.tours")} value={fmtN(sale.tours || 0)} />
            <DetailRow label={t("admin.table.volume")} value={fmt(sale.vol || 0)} />
            {sale.processDate && <DetailRow label={t("saleDetail.processDate")} value={longDate(sale.processDate, lang)} />}
            {sale.note && <DetailRow label={t("exp.sale.notes")} value={sale.note} />}
          </div>
        </ToolSection>

        {showTools && (
          <>
            <ToolSection title={t("saleDetail.prospectTitle")} empty={!summary.name1 && !summary.name && !summary.city && !summary.country}>
              <div className="prospect-summary-list">
                <DetailRow label={t("exp.prospect.name")} value={displayName} />
                <DetailRow label={t("exp.prospect.id")} value={summary.prospectCode || sale.prospectCode} />
                <DetailRow label={t("exp.prospect.location")} value={[summary.city, summary.country].filter(Boolean).join(" / ")} />
                <DetailRow label={t("saleDetail.tourDate")} value={summary.tourDate ? longDate(summary.tourDate, lang) : undefined} />
              </div>
            </ToolSection>

            <ToolSection title={t("saleDetail.surveyTitle")} empty={!surveyRows.length}>
              <table className="dtbl pattern-table">
                <thead>
                  <tr>
                    <th>{t("tools.survey.pattern.source")}</th>
                    <th className="td-r">{t("tools.survey.pattern.vacYear")}</th>
                    <th className="td-r">{t("tools.survey.pattern.nightsYear")}</th>
                    <th className="td-r">{t("tools.survey.pattern.down")}</th>
                    <th className="td-r">{t("tools.survey.pattern.monthly")}</th>
                  </tr>
                </thead>
                <tbody>
                  {surveyRows.map((r, i) => (
                    <tr key={r.label} style={i === surveyRows.length - 1 ? { borderTop: "2px solid var(--border)", fontWeight: 700 } : undefined}>
                      <td>{r.label}</td>
                      <td className="td-r td-blue">{r.vac}</td>
                      <td className="td-r td-blue">{r.night}</td>
                      <td className="td-r td-blue">{r.dp}</td>
                      <td className="td-r td-green">{r.mi}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ToolSection>

            <ToolSection title={t("saleDetail.vacationTitle")} empty={!vacResult.viajes && !vacResult.costo}>
              <div className="prospect-summary-list">
                <DetailRow label={t("saleDetail.vac.trips")} value={fmtN(vacResult.viajes)} />
                <DetailRow label={t("saleDetail.vac.cost")} value={fmt(vacResult.costo)} />
                <DetailRow label={t("saleDetail.vac.years")} value={fmtN(vacResult.anios)} />
                <DetailRow label={t("saleDetail.vac.futureYear")} value={String(vacResult.futAno)} />
                <DetailRow label={t("saleDetail.vac.annual")} value={fmt(vacResult.ga)} />
                <DetailRow label={t("saleDetail.vac.futureCost")} value={fmt(vacResult.cf)} />
                <DetailRow label={t("saleDetail.vac.totalSimple")} value={fmt(vacResult.ts)} />
                <DetailRow label={t("saleDetail.vac.totalCompound")} value={fmt(vacResult.tc)} />
              </div>
            </ToolSection>

            <ToolSection title={t("saleDetail.worksheetTitle")} empty={!worksheetRows.length}>
              <div className="prospect-summary-list">
                {worksheetRows.map((row) => (
                  <DetailRow key={row.key} label={row.label} value={row.value} />
                ))}
              </div>
            </ToolSection>
          </>
        )}
      </div>
    </SalesModal>
  );
}
