import { Link } from "react-router-dom";
import { AdminTrendChart } from "@/components/admin/admin-trend-chart.jsx";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";
import { longDate } from "@/lib/format/dates";

function prospectName(p, t) {
  if (!p) return t("admin.prospect.free");
  return p.name || p.name1 || p.prospect_code || "—";
}

export function AdminOverviewPage() {
  const { t, lang } = useI18n();
  const { fmt, fmtN } = useMoney();
  const { loading, data, error } = useAdminFetch("overview");

  if (loading) return <div className="admin-page">{t("admin.loading.overview")}</div>;
  if (error) return <div className="admin-page admin-empty">{error}</div>;
  if (!data) return null;

  const kpis = [
    { label: t("admin.kpi.users"), value: fmtN(data.usersCount) },
    { label: t("admin.kpi.files"), value: fmtN(data.prospectsCount) },
    { label: t("admin.kpi.totalSales"), value: fmtN(data.salesCount) },
    { label: t("admin.kpi.totalVolume"), value: fmt(data.totalVolume) },
    { label: t("admin.kpi.monthSales"), value: fmtN(data.monthSalesCount) },
    { label: t("admin.kpi.monthVolume"), value: fmt(data.monthVolume) },
  ];

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1 className="admin-h1">{t("admin.overview.title")}</h1>
        <p className="admin-sub">{t("admin.overview.sub")}</p>
      </div>
      <div className="admin-kpis">
        {kpis.map((k) => (
          <div className="admin-kpi" key={k.label}>
            <div className="admin-kpi-label">{k.label}</div>
            <div className="admin-kpi-value">{k.value}</div>
          </div>
        ))}
      </div>
      <div className="client-table-card admin-chart-card">
        <div className="admin-card-head">{t("admin.chart.trend")}</div>
        <AdminTrendChart data={data.trend} />
      </div>
      <div className="admin-grid2">
        <div className="client-table-card">
          <div className="admin-card-head">{t("admin.chart.topSellers")}</div>
          {data.topSellers.length === 0 ? (
            <div className="admin-empty">{t("admin.empty.sales")}</div>
          ) : (
            <table className="client-table">
              <thead>
                <tr>
                  <th>{t("admin.table.seller")}</th>
                  <th style={{ textAlign: "right" }}>{t("admin.table.sales")}</th>
                  <th style={{ textAlign: "right" }}>{t("admin.table.volume")}</th>
                </tr>
              </thead>
              <tbody>
                {data.topSellers.map((s, i) => (
                  <tr key={i}>
                    <td>{s.name}</td>
                    <td style={{ textAlign: "right" }}>{fmtN(s.sales)}</td>
                    <td style={{ textAlign: "right" }}>{fmt(s.volume)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="client-table-card">
          <div className="admin-card-head">
            {t("admin.recentSales")}
            <Link to="/admin/sales" className="admin-card-link">{t("admin.viewAll")}</Link>
          </div>
          {data.recentSales.length === 0 ? (
            <div className="admin-empty">{t("admin.empty.sales")}</div>
          ) : (
            <table className="client-table">
              <thead>
                <tr>
                  <th>{t("admin.table.date")}</th>
                  <th>{t("admin.table.seller")}</th>
                  <th>{t("admin.table.file")}</th>
                  <th style={{ textAlign: "right" }}>{t("admin.table.volume")}</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSales.map((s) => (
                  <tr key={s.id}>
                    <td>{s.sale_date ? longDate(s.sale_date, lang) : "—"}</td>
                    <td>{s.seller}</td>
                    <td>{prospectName(s.prospect, t)}</td>
                    <td style={{ textAlign: "right" }}>{fmt(s.vol)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
