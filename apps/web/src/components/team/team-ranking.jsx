import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";

const MEDALS = ["🥇", "🥈", "🥉"];

export function TeamRanking({ ranking = [], onOpenMember }) {
  const { t } = useI18n();
  const { fmtN } = useMoney();

  if (!ranking.length) {
    return <div className="admin-empty">{t("team.empty")}</div>;
  }

  return (
    <div className="client-table-card">
      <table className="client-table">
        <thead>
          <tr>
            <th>#</th>
            <th>{t("team.col.name")}</th>
            <th>{t("team.kpi.sales")}</th>
            <th>{t("team.kpi.vol")}</th>
            <th>{t("team.exec.goalPct")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {ranking.map((row) => (
            <tr key={row.user_id}>
              <td className="team-rank-pos">
                {row.rank <= 3 ? (
                  <span aria-label={`${row.rank}`}>{MEDALS[row.rank - 1]}</span>
                ) : (
                  row.rank
                )}
              </td>
              <td>
                {row.name}
                {row.is_self ? ` (${t("team.self")})` : ""}
              </td>
              <td>{fmtN(row.ventas)}</td>
              <td>{fmtN(row.vol)}</td>
              <td>{row.goalPct == null ? "—" : `${fmtN(row.goalPct)}%`}</td>
              <td>
                {!row.is_self && onOpenMember ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => onOpenMember(row.user_id)}
                  >
                    {t("team.viewProspects")}
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
