
import { useMemo } from "react";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back";
import { SharedToolBanner } from "@/components/calculators/shared-tool-banner.jsx";
import { clientDisplayName } from "@/lib/clients";
import { computeSurvey, surveyHasData } from "@/lib/calculations/survey";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";
import { useToolSession } from "@/hooks/use-tool-session.js";
import { EMPTY_TOOL_BUCKET } from "@/lib/store-empty.js";
import { useDbStore } from "@/stores/db-store";
import { shallow } from "zustand/shallow";

const ROW_KEYS = [
  "tools.survey.pattern.current",
  "tools.survey.pattern.hist",
  "tools.survey.pattern.future",
  "tools.survey.pattern.blend",
] as const;

export function AnalysisPage({ clientId, shared }: { clientId?; shared? }) {
  const { t } = useI18n();
  const { fmt, fmtD } = useMoney();
  const moneySettings = useDbStore((s) => s.db.settings, shallow);
  const session = useToolSession({ clientId, shared });
  const { ready, backHref, readOnly, isShared, getBucket, prospect } = session;

  const survey = useMemo(() => {
    if (!ready) return EMPTY_TOOL_BUCKET;
    if (isShared) return getBucket("survey") as Record<string, string>;
    const bucket = getBucket("survey");
    if (Object.keys(bucket).length) return bucket as Record<string, string>;
    return (prospect?.data?.survey || EMPTY_TOOL_BUCKET) as Record<string, string>;
  }, [ready, isShared, getBucket, prospect?.id, shared?.prospectId]);

  const c = prospect;
  const result = useMemo(
    () => computeSurvey(survey, String(survey.stype || "hotel")),
    [survey, moneySettings?.currency, moneySettings?.exchangeRate, moneySettings?.language],
  );
  const hasData = surveyHasData(survey);

  const rows: { label: string; vac: string; night: string; dp: string; mi: string }[] = [
    { label: t(ROW_KEYS[0]), vac: String(result.current.vac), night: fmtD(result.current.night), dp: fmt(result.current.dp), mi: fmt(result.current.mi) },
    { label: t(ROW_KEYS[1]), vac: fmtD(result.hist.vac), night: fmtD(result.hist.night), dp: fmt(result.hist.dp), mi: fmt(result.hist.mi) },
    { label: t(ROW_KEYS[2]), vac: fmtD(result.future.vac), night: fmtD(result.future.night), dp: fmt(result.future.dp), mi: fmt(result.future.mi) },
    { label: t(ROW_KEYS[3]), vac: fmtD(result.pattern.vac), night: fmtD(result.pattern.night), dp: fmt(result.pattern.dp), mi: fmt(result.pattern.mi) },
  ];

  return (
    <>
      <Topbar title={t("tools.analysis.title")} subtitle={t("tools.analysis.sub")} />
      <div className="sales-page">
        <div className="page-toolbar">
          <PageBack inline href={backHref} />
        </div>

        <SharedToolBanner show={readOnly} />

        <div className="card">
          <div className="card-heading">{t("tools.survey.patternTitle")}</div>
          <div className="card-sub">{t("tools.analysis.calcSub")}</div>
          {!hasData && (
            <div className="analysis-empty">{t("tools.analysis.emptyLong")}</div>
          )}
          <div className="table-scroll">
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
              {rows.map((r, i) => (
                <tr key={r.label} style={i === rows.length - 1 ? { borderTop: "2px solid var(--border)", fontWeight: 700 } : undefined}>
                  <td>{r.label}</td>
                  <td className="td-r td-blue">{r.vac}</td>
                  <td className="td-r td-blue">{r.night}</td>
                  <td className="td-r td-blue">{r.dp}</td>
                  <td className="td-r td-green">{r.mi}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </>
  );
}
