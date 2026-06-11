import { Link } from "react-router-dom";
import { useI18n } from "@/hooks/use-i18n.js";
import type { UserAdminFilters } from "@/lib/admin/types";
import { userFiltersToSearchParams } from "@/lib/admin/filters";

const ROLES = [
  { value: "", key: "admin.filters.allRoles" },
  { value: "vendedor", key: "admin.filters.seller" },
  { value: "admin", label: "Admin" },
];

const STATES = [
  { value: "", key: "admin.filters.allStates" },
  { value: "active", label: "Activas" },
  { value: "inactive", label: "Desactivadas" },
];

export function AdminUsersFilters({
  filters,
  exportHref,
  showExport = true,
}: {
  filters: UserAdminFilters;
  exportHref;
  showExport?: boolean;
}) {
  const { t } = useI18n();
  const qs = userFiltersToSearchParams(filters);

  return (
    <div className="admin-filters">
      <form method="GET" action="/admin/users" className="admin-filters-form">
        <div className="admin-filter-field admin-filter-field-wide">
          <label>{t("admin.filters.search")}</label>
          <input
            type="search"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Nombre o correo…"
            className="auth-input"
          />
        </div>
        <div className="admin-filter-field">
          <label>{t("admin.filters.role")}</label>
          <select name="role" defaultValue={filters.role ?? ""} className="auth-input">
            {ROLES.map((r) => (
              <option key={r.value || "all"} value={r.value}>{r.key ? t(r.key) : r.label}</option>
            ))}
          </select>
        </div>
        <div className="admin-filter-field">
          <label>{t("admin.filters.state")}</label>
          <select name="state" defaultValue={filters.state ?? ""} className="auth-input">
            {STATES.map((s) => (
              <option key={s.value || "all"} value={s.value}>{s.key ? t(s.key) : s.label}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary">{t("admin.filters.apply")}</button>
        {qs && <Link to="/admin/users" className="btn btn-ghost">{t("common.clear")}</Link>}
      </form>
      {showExport && (
        <a href={exportHref} className="btn btn-ghost admin-export-btn">{t("admin.filters.exportCsv")}</a>
      )}
    </div>
  );
}
