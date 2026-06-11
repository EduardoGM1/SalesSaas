import { Link } from "react-router-dom";
import { useI18n } from "@/hooks/use-i18n.js";
import type { SellerInfo } from "@/lib/admin/data";
import { filtersToSearchParams, type AdminFilters } from "@/lib/admin/filters";

/** Filtros de worksheets (servidor, sin cliente). */
export function AdminWorksheetsFilters({
  filters,
  sellers,
}: {
  filters: AdminFilters;
  sellers: SellerInfo[];
}) {
  const { t } = useI18n();
  const qs = filtersToSearchParams(filters);

  return (
    <div className="admin-filters">
      <form method="GET" action="/admin/worksheets" className="admin-filters-form">
        <div className="admin-filter-field">
          <label>{t("admin.filters.from")}</label>
          <input type="date" name="from" defaultValue={filters.from ?? ""} className="auth-input" />
        </div>
        <div className="admin-filter-field">
          <label>{t("admin.filters.to")}</label>
          <input type="date" name="to" defaultValue={filters.to ?? ""} className="auth-input" />
        </div>
        <div className="admin-filter-field">
          <label>{t("admin.filters.seller")}</label>
          <select name="user" defaultValue={filters.userId ?? ""} className="auth-input">
            <option value="">{t("admin.filters.all")}</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary">{t("admin.filters.apply")}</button>
        {qs && <Link to="/admin/worksheets" className="btn btn-ghost">{t("common.clear")}</Link>}
      </form>
    </div>
  );
}
