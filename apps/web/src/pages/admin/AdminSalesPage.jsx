import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminFiltersBar } from "@/components/admin/admin-filters-bar.jsx";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { parseAdminFilters, filtersToSearchParams } from "@/lib/admin/filters";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";
import { longDate } from "@/lib/format/dates";
import { statusLabel } from "@/lib/format/status";

function prospectName(p, t) {
  if (!p) return t("admin.prospect.free");
  return p.name || p.name1 || p.prospect_code || "—";
}

export function AdminSalesPage() {
  const { t, lang } = useI18n();
  const { fmt, fmtN } = useMoney();
  const [searchParams] = useSearchParams();
  const filters = useMemo(() => parseAdminFilters(Object.fromEntries(searchParams.entries())), [searchParams]);
  const qs = searchParams.toString();
  const search = qs ? `?${qs}` : "";

  const salesState = useAdminFetch("sales", search);
  const sellersState = useAdminFetch("sellers");

  if (salesState.loading || sellersState.loading) return <div className="admin-page">{t("admin.loading.sales")}</div>;
  if (salesState.error) return <div className="admin-page admin-empty">{salesState.error}</div>;

  const sales = salesState.data ?? [];
  const sellers = sellersState.data ?? [];
  const total = sales.reduce((acc, s) => acc + s.vol, 0);
  const exportHref = `/api/v1/admin/export/sales${filtersToSearchParams(filters)}`;

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1 className="admin-h1">{t("admin.sales.title")}</h1>
        <p className="admin-sub">{t("admin.sales.sub", { count: fmtN(sales.length), volume: fmt(total) })}</p>
      </div>
      <AdminFiltersBar filters={filters} sellers={sellers} showStatus exportHref={exportHref} />
      <div className="client-table-card">
        {sales.length === 0 ? (
          <div className="admin-empty">{t("admin.sales.emptyFiltered")}</div>
        ) : (
          <table className="client-table">
            <thead>
              <tr>
                <th>{t("admin.table.date")}</th>
                <th>{t("admin.table.seller")}</th>
                <th>{t("admin.table.file")}</th>
                <th>{t("admin.table.contract")}</th>
                <th>{t("admin.table.status")}</th>
                <th style={{ textAlign: "right" }}>Tours</th>
                <th style={{ textAlign: "right" }}>{t("admin.table.volume")}</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id}>
                  <td>{s.sale_date ? longDate(s.sale_date, lang) : "—"}</td>
                  <td>{s.seller}</td>
                  <td>{prospectName(s.prospect, t)}</td>
                  <td>{s.contract || "—"}</td>
                  <td>{statusLabel(s.status ?? undefined, lang)}</td>
                  <td style={{ textAlign: "right" }}>{fmtN(s.tours)}</td>
                  <td style={{ textAlign: "right" }}>{fmt(s.vol)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
