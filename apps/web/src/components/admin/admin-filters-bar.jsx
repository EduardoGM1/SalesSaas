
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useI18n } from "@/hooks/use-i18n.js";
import { filtersToSearchParams } from "@/lib/admin/filters";

const STATUS_OPTIONS = [
  { value: "", key: "admin.filters.allStatuses" },
  { value: "venta", key: "status.sale" },
  { value: "bback", key: "status.bback" },
  { value: "pendiente", key: "status.notProcessable" },
  { value: "perdido", key: "status.lost" },
  { value: "cerrado", key: "status.closed" },
  { value: "cancelada", key: "status.cancelled" },
];

/** Filtros admin sin hard reload (navegación SPA). */
export function AdminFiltersBar({ filters, sellers, showStatus, exportHref }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const qs = filtersToSearchParams(filters);

  const onSubmit = (event) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    for (const [key, value] of fd.entries()) {
      const v = String(value || "").trim();
      if (v) params.set(key, v);
    }
    const search = params.toString();
    navigate(search ? `${pathname}?${search}` : pathname);
  };

  return (
    <div className="admin-filters">
      <form onSubmit={onSubmit} className="admin-filters-form">
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
            {(sellers || []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        {showStatus && (
          <div className="admin-filter-field">
            <label>{t("admin.filters.status")}</label>
            <select name="status" defaultValue={filters.status ?? ""} className="auth-input">
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value || "all"} value={s.value}>{t(s.key)}</option>
              ))}
            </select>
          </div>
        )}
        <button type="submit" className="btn btn-primary">{t("admin.filters.apply")}</button>
        {qs && (
          <Link to={pathname} className="btn btn-ghost">{t("common.clear")}</Link>
        )}
      </form>
      {exportHref && (
        <a href={exportHref} className="btn btn-ghost admin-export-btn">{t("admin.filters.exportCsv")}</a>
      )}
    </div>
  );
}
