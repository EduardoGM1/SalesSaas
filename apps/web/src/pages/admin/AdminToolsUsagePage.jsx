import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminFiltersBar } from "@/components/admin/admin-filters-bar.jsx";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { parseAdminFilters } from "@/lib/admin/filters";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";

const TOOL_LABEL_KEYS = {
  survey: "tools.survey",
  vacaciones: "tools.vacation",
  worksheet: "tools.worksheet",
};

export function AdminToolsUsagePage() {
  const { t } = useI18n();
  const { fmtN } = useMoney();
  const [searchParams] = useSearchParams();
  const filters = useMemo(() => parseAdminFilters(Object.fromEntries(searchParams.entries())), [searchParams]);
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const toolsState = useAdminFetch("tools-usage", search);
  const sellersState = useAdminFetch("sellers");

  if (toolsState.loading || sellersState.loading) {
    return <div className="admin-page">{t("admin.loading.tools")}</div>;
  }
  if (toolsState.error) {
    return <div className="admin-page admin-empty">{toolsState.error}</div>;
  }

  const data = toolsState.data ?? { totalSaves: 0, byTool: [], topUsers: [], trend: [] };
  const sellers = sellersState.data ?? [];
  const total = data.totalSaves || 1;

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1 className="admin-h1">{t("admin.tools.title")}</h1>
        <p className="admin-sub">{t("admin.tools.sub")}</p>
      </div>
      <AdminFiltersBar filters={filters} sellers={sellers} />
      <div className="admin-kpis">
        <div className="admin-kpi">
          <div className="admin-kpi-label">{t("admin.tools.totalSaves")}</div>
          <div className="admin-kpi-value">{fmtN(data.totalSaves)}</div>
        </div>
        {(data.byTool ?? []).map((row) => (
          <div className="admin-kpi" key={row.tool}>
            <div className="admin-kpi-label">{t(TOOL_LABEL_KEYS[row.tool] || row.tool)}</div>
            <div className="admin-kpi-value">{fmtN(row.saves)}</div>
            <div className="admin-kpi-sub">
              {fmtN(row.uniqueUsers)} {t("admin.tools.users")} · {Math.round((row.saves / total) * 100)}%
            </div>
          </div>
        ))}
      </div>

      <div className="admin-grid2">
        <div className="client-table-card">
          <div className="admin-card-head">{t("admin.tools.byTool")}</div>
          {(data.byTool ?? []).length === 0 ? (
            <div className="admin-empty">{t("admin.tools.empty")}</div>
          ) : (
            <table className="client-table">
              <thead>
                <tr>
                  <th>{t("admin.tools.tool")}</th>
                  <th style={{ textAlign: "right" }}>{t("admin.tools.saves")}</th>
                  <th style={{ textAlign: "right" }}>{t("admin.tools.users")}</th>
                  <th style={{ textAlign: "right" }}>{t("admin.tools.libre")}</th>
                  <th style={{ textAlign: "right" }}>{t("admin.tools.linked")}</th>
                </tr>
              </thead>
              <tbody>
                {(data.byTool ?? []).map((row) => (
                  <tr key={row.tool}>
                    <td>{t(TOOL_LABEL_KEYS[row.tool] || row.tool)}</td>
                    <td style={{ textAlign: "right" }}>{fmtN(row.saves)}</td>
                    <td style={{ textAlign: "right" }}>{fmtN(row.uniqueUsers)}</td>
                    <td style={{ textAlign: "right" }}>{fmtN(row.libre)}</td>
                    <td style={{ textAlign: "right" }}>{fmtN(row.linked)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="client-table-card">
          <div className="admin-card-head">{t("admin.tools.topUsers")}</div>
          {(data.topUsers ?? []).length === 0 ? (
            <div className="admin-empty">{t("admin.tools.empty")}</div>
          ) : (
            <table className="client-table">
              <thead>
                <tr>
                  <th>{t("admin.table.seller")}</th>
                  <th style={{ textAlign: "right" }}>{t("admin.tools.saves")}</th>
                  <th style={{ textAlign: "right" }}>Survey</th>
                  <th style={{ textAlign: "right" }}>{t("tools.vacation")}</th>
                  <th style={{ textAlign: "right" }}>Worksheet</th>
                </tr>
              </thead>
              <tbody>
                {(data.topUsers ?? []).map((u) => (
                  <tr key={u.user_id}>
                    <td>{u.name}</td>
                    <td style={{ textAlign: "right" }}>{fmtN(u.total)}</td>
                    <td style={{ textAlign: "right" }}>{fmtN(u.survey)}</td>
                    <td style={{ textAlign: "right" }}>{fmtN(u.vacaciones)}</td>
                    <td style={{ textAlign: "right" }}>{fmtN(u.worksheet)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="client-table-card" style={{ marginTop: 16 }}>
        <div className="admin-card-head">{t("admin.tools.trend")}</div>
        {(data.trend ?? []).length === 0 ? (
          <div className="admin-empty">{t("admin.tools.empty")}</div>
        ) : (
          <table className="client-table">
            <thead>
              <tr>
                <th>{t("admin.table.period")}</th>
                <th style={{ textAlign: "right" }}>Survey</th>
                <th style={{ textAlign: "right" }}>{t("tools.vacation")}</th>
                <th style={{ textAlign: "right" }}>Worksheet</th>
              </tr>
            </thead>
            <tbody>
              {(data.trend ?? []).map((row) => (
                <tr key={row.month}>
                  <td>{row.label || row.month}</td>
                  <td style={{ textAlign: "right" }}>{fmtN(row.survey)}</td>
                  <td style={{ textAlign: "right" }}>{fmtN(row.vacaciones)}</td>
                  <td style={{ textAlign: "right" }}>{fmtN(row.worksheet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
