import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";

function ProgressRow({ label, pct, real, goal, fmtN }) {
  const value = pct == null ? null : Math.min(100, Math.max(0, Number(pct) || 0));
  return (
    <div className="team-goal-row">
      <div className="team-goal-row-head">
        <span>{label}</span>
        <span>
          {value == null ? "—" : `${fmtN(value)}%`}
          {goal > 0 ? ` · ${fmtN(real)} / ${fmtN(goal)}` : ""}
        </span>
      </div>
      <div className="team-goal-track">
        <div
          className={`team-goal-fill${value != null && value < 70 ? " team-goal-fill--low" : ""}`}
          style={{ width: `${value == null ? 0 : value}%` }}
        />
      </div>
    </div>
  );
}

export function TeamGoalsProgress({ goalsProgress, month }) {
  const { t } = useI18n();
  const { fmtN } = useMoney();
  const g = goalsProgress || {};

  if (!g.goalVol && !g.goalTours && !g.goalVentas) {
    return <div className="admin-empty">{t("team.exec.goalsEmpty")}</div>;
  }

  return (
    <div className="team-goals">
      <ProgressRow
        label={t("team.exec.goalVol")}
        pct={g.pctVol}
        real={month?.vol || 0}
        goal={g.goalVol || 0}
        fmtN={fmtN}
      />
      <ProgressRow
        label={t("team.exec.goalTours")}
        pct={g.pctTours}
        real={month?.tours || 0}
        goal={g.goalTours || 0}
        fmtN={fmtN}
      />
      <ProgressRow
        label={t("team.exec.goalSales")}
        pct={g.pctVentas}
        real={month?.ventas || 0}
        goal={g.goalVentas || 0}
        fmtN={fmtN}
      />
      <div className="team-goals-footer">
        <div>
          {t("team.exec.remainingVol")}: <strong>{fmtN(g.remainingVol || 0)}</strong>
        </div>
        <div>
          {t("team.exec.projectedVol")}: <strong>{fmtN(g.projectedVol || 0)}</strong>
          {g.remainingDays != null ? ` · ${t("team.exec.daysLeft", { n: g.remainingDays })}` : ""}
        </div>
      </div>
    </div>
  );
}
