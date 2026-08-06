import { useMemo } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { AdminFiltersBar } from "@/components/admin/admin-filters-bar.jsx";
import { AdminViewToggle } from "@/components/admin/admin-view-toggle.jsx";
import { AdminToolsByToolChart } from "@/components/admin/admin-tools-by-tool-chart.jsx";
import { AdminToolsTrendChart } from "@/components/admin/admin-tools-trend-chart.jsx";
import { AdminChartCard, AdminKpiCard, AdminPageHeader, AdminPageState } from "@/components/admin/admin-ui.jsx";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { useAdminViewPref } from "@/hooks/use-admin-view-pref.js";
import { parseAdminFilters, filtersToSearchParams } from "@/lib/admin/filters";
import { adminPermissionSetHas, expandAdminPermissionSet, isSuperAdmin } from "@/lib/auth/permissions";
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
  const session = useOutletContext();
  const [searchParams] = useSearchParams();
  const filters = useMemo(() => parseAdminFilters(Object.fromEntries(searchParams.entries())), [searchParams]);
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const toolsState = useAdminFetch("tools-usage", search);
  const sellersState = useAdminFetch("sellers");
  const [byToolView, setByToolView] = useAdminViewPref("byTool", "chart");
  const [trendView, setTrendView] = useAdminViewPref("trend", "chart");

  const canUseTableView = Boolean(
    session?.isSuperAdmin || (session?.profile && isSuperAdmin(session.profile)),
  );
  const permSet = expandAdminPermissionSet(session?.permissions || session?.profile?.admin_permissions || []);
  const canExport = Boolean(session?.isSuperAdmin || adminPermissionSetHas(permSet, "metricas.export_csv"));
  const exportHref = `/api/v1/admin/export/metrics${filtersToSearchParams(filters)}`;
  const byToolMode = canUseTableView ? byToolView : "chart";
  const trendMode = canUseTableView ? trendView : "chart";

  const data = toolsState.data ?? { totalSaves: 0, byTool: [], trend: [] };
  const sellers = sellersState.data ?? [];
  const byTool = data.byTool ?? [];
  const trend = data.trend ?? [];
  const total = data.totalSaves || 1;

  return (
    <div className="admin-page admin-system-page">
      <AdminPageHeader eyebrow="Adopción" title={t("admin.tools.title")} subtitle={t("admin.tools.sub")} />
      <AdminFiltersBar filters={filters} sellers={sellers} exportHref={canExport ? exportHref : undefined} />
      <AdminPageState loading={toolsState.loading || sellersState.loading} error={toolsState.error} skeleton="overview">
        <>
      <div className="admin-tools-kpis">
        <AdminKpiCard label={t("admin.tools.totalSaves")} value={fmtN(data.totalSaves)} description="Guardados acumulados en el periodo" />
        {byTool.map((row) => (
          <AdminKpiCard key={row.tool} label={t(TOOL_LABEL_KEYS[row.tool] || row.tool)} value={fmtN(row.saves)} comparison={`${Math.round((row.saves / total) * 100)}%`} tone="info" description={`${fmtN(row.uniqueUsers)} ${t("admin.tools.users")}`} />
        ))}
      </div>

      <AdminChartCard title={t("admin.tools.byTool")} className="admin-tools-section" action={canUseTableView ? (
            <AdminViewToggle
              value={byToolView}
              onChange={setByToolView}
              tableLabel={t("admin.view.table")}
              chartLabel={t("admin.view.chart")}
            />
          ) : null}>
        {byTool.length === 0 ? (
          <div className="admin-empty">{t("admin.tools.empty")}</div>
        ) : byToolMode === "chart" ? (
          <AdminToolsByToolChart byTool={byTool} />
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
              {byTool.map((row) => (
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
      </AdminChartCard>

      <AdminChartCard title={t("admin.tools.trend")} className="admin-tools-section" action={canUseTableView ? (
            <AdminViewToggle
              value={trendView}
              onChange={setTrendView}
              tableLabel={t("admin.view.table")}
              chartLabel={t("admin.view.chart")}
            />
          ) : null}>
        {trend.length === 0 ? (
          <div className="admin-empty">{t("admin.tools.empty")}</div>
        ) : trendMode === "chart" ? (
          <AdminToolsTrendChart trend={trend} />
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
              {trend.map((row) => (
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
      </AdminChartCard>
        </>
      </AdminPageState>
    </div>
  );
}
