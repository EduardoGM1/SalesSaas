import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminFiltersBar } from "@/components/admin/admin-filters-bar.jsx";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { parseAdminFilters } from "@/lib/admin/filters";
import { useI18n } from "@/hooks/use-i18n.js";
import { longDate } from "@/lib/format/dates";

function prospectName(p) {
  if (!p) return "Libre";
  return p.name || p.name1 || p.prospect_code || "—";
}

export function AdminActivityPage() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const filters = useMemo(() => parseAdminFilters(Object.fromEntries(searchParams.entries())), [searchParams]);
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const activitiesState = useAdminFetch("activities", search);
  const sellersState = useAdminFetch("sellers");

  if (activitiesState.loading || sellersState.loading) return <div className="admin-page">{t("admin.loading.activity")}</div>;
  if (activitiesState.error) return <div className="admin-page admin-empty">{activitiesState.error}</div>;

  const activities = activitiesState.data ?? [];
  const sellers = sellersState.data ?? [];

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1 className="admin-h1">{t("admin.activity.title")}</h1>
        <p className="admin-sub">{t("admin.activity.sub")}</p>
      </div>
      <AdminFiltersBar filters={filters} sellers={sellers} />
      <div className="client-table-card">
        {activities.length === 0 ? (
          <div className="admin-empty">{t("admin.activity.empty")}</div>
        ) : (
          <table className="client-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Vendedor</th>
                <th>Tipo</th>
                <th>Título</th>
                <th>Expediente</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.activity_date
                      ? longDate(a.activity_date)
                      : a.created_at
                        ? longDate(String(a.created_at).slice(0, 10))
                        : "—"}
                  </td>
                  <td>{a.seller}</td>
                  <td>{a.type}</td>
                  <td>{a.title || "—"}</td>
                  <td>{prospectName(a.prospect)}</td>
                  <td>{a.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
