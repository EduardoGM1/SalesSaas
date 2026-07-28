import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { AdminFilterBar } from "@/components/admin/admin-ui.jsx";
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

const PLANS = [
  { value: "", label: "Todos los planes" },
  { value: "basico", key: "admin.users.plan.basico" },
  { value: "pro", key: "admin.users.plan.pro" },
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
    <form method="GET" action="/admin/users">
      <AdminFilterBar
        className="admin-users-filterbar"
        actions={
          <>
            <button type="submit" className="btn btn-primary">{t("admin.filters.apply")}</button>
            {qs ? <Link to="/admin/users" className="btn btn-ghost">{t("common.clear")}</Link> : null}
            {showExport ? <a href={exportHref} className="btn btn-ghost">{t("admin.filters.exportCsv")}</a> : null}
          </>
        }
      >
        <div className="admin-filter-field admin-filter-field-wide">
          <label htmlFor="admin-users-search">{t("admin.filters.search")}</label>
          <div className="admin-search-input">
            <Search size={15} aria-hidden />
            <input id="admin-users-search" type="search" name="q" defaultValue={filters.q ?? ""} placeholder="Nombre o correo…" className="auth-input" />
          </div>
        </div>
        <div className="admin-filter-field">
          <label htmlFor="admin-users-role">{t("admin.filters.role")}</label>
          <select id="admin-users-role" name="role" defaultValue={filters.role ?? ""} className="auth-input">
            {ROLES.map((r) => (
              <option key={r.value || "all"} value={r.value}>{r.key ? t(r.key) : r.label}</option>
            ))}
          </select>
        </div>
        <div className="admin-filter-field">
          <label htmlFor="admin-users-state">{t("admin.filters.state")}</label>
          <select id="admin-users-state" name="state" defaultValue={filters.state ?? ""} className="auth-input">
            {STATES.map((s) => (
              <option key={s.value || "all"} value={s.value}>{s.key ? t(s.key) : s.label}</option>
            ))}
          </select>
        </div>
        <div className="admin-filter-field">
          <label htmlFor="admin-users-plan">{t("admin.users.col.plan")}</label>
          <select id="admin-users-plan" name="plan" defaultValue={filters.plan ?? ""} className="auth-input">
            {PLANS.map((plan) => <option key={plan.value || "all"} value={plan.value}>{plan.key ? t(plan.key) : plan.label}</option>)}
          </select>
        </div>
      </AdminFilterBar>
    </form>
  );
}
