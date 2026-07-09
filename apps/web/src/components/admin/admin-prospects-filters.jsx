import { Link } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { useI18n } from "@/hooks/use-i18n.js";
import { DEFAULT_TOUR_TYPES } from "@/lib/store-empty.js";
import { filtersToSearchParams } from "@/lib/admin/filters";

export function AdminProspectsFilters({ filters, sellers }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const qs = filtersToSearchParams(filters);

  return (
    <div className="admin-filters">
      <form method="GET" action={pathname} className="admin-filters-form">
        <div className="admin-filter-field admin-filter-field-wide">
          <label>{t("admin.filters.search")}</label>
          <input
            type="search"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder={t("admin.prospects.searchPlaceholder")}
            className="auth-input"
          />
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
        <div className="admin-filter-field">
          <label>{t("admin.prospects.tourType")}</label>
          <select name="tipoTour" defaultValue={filters.tipoTour ?? ""} className="auth-input">
            <option value="">{t("admin.filters.all")}</option>
            {DEFAULT_TOUR_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        <div className="admin-filter-field">
          <label>{t("admin.filters.from")}</label>
          <input type="date" name="from" defaultValue={filters.from ?? ""} className="auth-input" />
        </div>
        <div className="admin-filter-field">
          <label>{t("admin.filters.to")}</label>
          <input type="date" name="to" defaultValue={filters.to ?? ""} className="auth-input" />
        </div>
        <button type="submit" className="btn btn-primary">{t("admin.filters.apply")}</button>
        {qs && (
          <Link to={pathname} className="btn btn-ghost">{t("common.clear")}</Link>
        )}
      </form>
    </div>
  );
}
