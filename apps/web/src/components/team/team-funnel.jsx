import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";

const STAGE_KEYS = {
  tours: "team.exec.funnel.tours",
  discovery: "team.exec.funnel.discovery",
  worksheet: "team.exec.funnel.worksheet",
  analysis: "team.exec.funnel.analysis",
  ventas: "team.exec.funnel.sales",
};

export function TeamFunnel({ funnel = [] }) {
  const { t } = useI18n();
  const { fmtN } = useMoney();
  const max = Math.max(1, ...funnel.map((s) => Number(s.count) || 0));

  if (!funnel.length) {
    return <div className="admin-empty">{t("team.exec.funnelEmpty")}</div>;
  }

  return (
    <div className="team-funnel">
      {funnel.map((stage, idx) => {
        const width = Math.max(12, ((Number(stage.count) || 0) / max) * 100);
        return (
          <div key={stage.stage} className="team-funnel-row">
            <div className="team-funnel-label">{t(STAGE_KEYS[stage.stage] || stage.stage)}</div>
            <div className="team-funnel-bar-wrap">
              <div className="team-funnel-bar" style={{ width: `${width}%` }} />
            </div>
            <div className="team-funnel-meta">
              <strong>{fmtN(stage.count)}</strong>
              {idx > 0 ? (
                <span className="team-funnel-conv">
                  {fmtN(stage.pctFromPrev)}% · −{fmtN(stage.dropOff)}
                </span>
              ) : (
                <span className="team-funnel-conv">{t("team.exec.funnelBase")}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
