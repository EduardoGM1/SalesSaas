import { Link } from "react-router-dom";
import type { UserAdminFilters } from "@/lib/admin/types";
import { userFiltersToSearchParams } from "@/lib/admin/filters";

const ROLES = [
  { value: "", label: "Todos los roles" },
  { value: "vendedor", label: "Vendedor" },
  { value: "admin", label: "Admin" },
];

const STATES = [
  { value: "", label: "Todas las cuentas" },
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
  const qs = userFiltersToSearchParams(filters);

  return (
    <div className="admin-filters">
      <form method="GET" action="/admin/users" className="admin-filters-form">
        <div className="admin-filter-field admin-filter-field-wide">
          <label>Buscar</label>
          <input
            type="search"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Nombre o correo…"
            className="auth-input"
          />
        </div>
        <div className="admin-filter-field">
          <label>Rol</label>
          <select name="role" defaultValue={filters.role ?? ""} className="auth-input">
            {ROLES.map((r) => (
              <option key={r.value || "all"} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div className="admin-filter-field">
          <label>Estado</label>
          <select name="state" defaultValue={filters.state ?? ""} className="auth-input">
            {STATES.map((s) => (
              <option key={s.value || "all"} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary">Filtrar</button>
        {qs && <Link to="/admin/users" className="btn btn-ghost">Limpiar</Link>}
      </form>
      {showExport && (
        <a to={exportHref} className="btn btn-ghost admin-export-btn">Exportar CSV</a>
      )}
    </div>
  );
}
