import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminProspectsFilters } from "@/components/admin/admin-prospects-filters.jsx";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { parseAdminFilters } from "@/lib/admin/filters";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";
import { longDate } from "@/lib/format/dates";
import { statusLabel } from "@/lib/format/status";

function prospectDisplayName(p) {
  return p.name || p.name1 || p.prospect_code || "—";
}

function tourTypeCell(p, t) {
  if (!p.tipo_tour) return "—";
  const quant = p.tour_cuantificable !== false ? "1" : "0";
  return `${p.tipo_tour} - ${quant}`;
}

export function AdminProspectsPage() {
  const { t, lang } = useI18n();
  const { fmtN } = useMoney();
  const [searchParams] = useSearchParams();
  const filters = useMemo(() => parseAdminFilters(Object.fromEntries(searchParams.entries())), [searchParams]);
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const prospectsState = useAdminFetch("prospects", search);
  const sellersState = useAdminFetch("sellers");

  if (prospectsState.loading || sellersState.loading) {
    return <div className="admin-page">{t("admin.loading.prospects")}</div>;
  }
  if (prospectsState.error) return <div className="admin-page admin-empty">{prospectsState.error}</div>;

  const prospects = prospectsState.data ?? [];
  const sellers = sellersState.data ?? [];

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1 className="admin-h1">{t("admin.prospects.title")}</h1>
        <p className="admin-sub">{t("admin.prospects.sub", { count: fmtN(prospects.length) })}</p>
      </div>
      <AdminProspectsFilters filters={filters} sellers={sellers} />
      <div className="client-table-card">
        {prospects.length === 0 ? (
          <div className="admin-empty">{t("admin.prospects.empty")}</div>
        ) : (
          <table className="client-table">
            <thead>
              <tr>
                <th>{t("admin.table.seller")}</th>
                <th>{t("admin.table.file")}</th>
                <th>{t("admin.prospects.tourType")}</th>
                <th>{t("admin.prospects.tourDate")}</th>
                <th>{t("admin.table.status")}</th>
                <th>{t("admin.prospects.location")}</th>
                <th>{t("admin.prospects.created")}</th>
              </tr>
            </thead>
            <tbody>
              {prospects.map((p) => (
                <tr key={p.id}>
                  <td>{p.seller}</td>
                  <td>
                    <span>{prospectDisplayName(p)}</span>
                    {p.prospect_code && (
                      <span className="admin-cell-muted"> · {p.prospect_code}</span>
                    )}
                  </td>
                  <td>{tourTypeCell(p, t)}</td>
                  <td>{p.tour_date ? longDate(p.tour_date, lang) : "—"}</td>
                  <td>{statusLabel(p.status ?? undefined, lang)}</td>
                  <td>{[p.city, p.country].filter(Boolean).join(", ") || "—"}</td>
                  <td>{p.created_at ? longDate(String(p.created_at).slice(0, 10), lang) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
