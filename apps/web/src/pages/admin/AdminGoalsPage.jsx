import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminFiltersBar } from "@/components/admin/admin-filters-bar.jsx";
import { AdminDataView, AdminPageHeader, AdminPageState } from "@/components/admin/admin-ui.jsx";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { parseAdminFilters } from "@/lib/admin/filters";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";

const MONTHS = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function AdminGoalsPage() {
  const { t } = useI18n();
  const { fmt, fmtN } = useMoney();
  const [searchParams] = useSearchParams();
  const filters = useMemo(() => parseAdminFilters(Object.fromEntries(searchParams.entries())), [searchParams]);
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const goalsState = useAdminFetch("goals", search);
  const sellersState = useAdminFetch("sellers");

  const goals = goalsState.data ?? [];
  const sellers = sellersState.data ?? [];

  return (
    <div className="admin-page admin-system-page">
      <AdminPageHeader eyebrow="Objetivos" title={t("admin.goals.title")} subtitle={t("admin.goals.sub")} meta={<span>{goals.length} metas visibles</span>} />
      <AdminFiltersBar filters={filters} sellers={sellers} />
      <AdminPageState loading={goalsState.loading || sellersState.loading} error={goalsState.error}>
        <AdminDataView empty={!goals.length} emptyTitle={t("admin.goals.empty")}>
          <div className="client-table-card admin-system-table">
          <table className="client-table">
            <thead>
              <tr>
                <th>Vendedor</th>
                <th>Periodo</th>
                <th style={{ textAlign: "right" }}>Volumen</th>
                <th style={{ textAlign: "right" }}>{t("admin.table.tours")}</th>
                <th style={{ textAlign: "right" }}>Ventas</th>
                <th style={{ textAlign: "right" }}>Días</th>
                <th style={{ textAlign: "right" }}>Descansos</th>
              </tr>
            </thead>
            <tbody>
              {goals.map((g) => (
                <tr key={`${g.user_id}-${g.year}-${g.month}`}>
                  <td>{g.seller}</td>
                  <td>{MONTHS[g.month]} {g.year}</td>
                  <td style={{ textAlign: "right" }}>{fmt(g.vol)}</td>
                  <td style={{ textAlign: "right" }}>{fmtN(g.tours)}</td>
                  <td style={{ textAlign: "right" }}>{fmtN(g.ventas)}</td>
                  <td style={{ textAlign: "right" }}>{fmtN(g.dias)}</td>
                  <td style={{ textAlign: "right" }}>{fmtN(g.descansos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </AdminDataView>
      </AdminPageState>
    </div>
  );
}
