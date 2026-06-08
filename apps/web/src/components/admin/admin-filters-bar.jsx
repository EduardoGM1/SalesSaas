
import { Link } from "react-router-dom";
import { useLocation } from "react-router-dom";
import type { SellerInfo } from "@/lib/admin/data";
import { filtersToSearchParams, type AdminFilters } from "@/lib/admin/filters";

const STATUSES = [
  { value: "", label: "Todos los estados" },
  { value: "venta", label: "Venta" },
  { value: "bback", label: "B-back" },
  { value: "procesable", label: "Procesable" },
  { value: "no-procesable", label: "No procesable" },
  { value: "perdido", label: "Perdido" },
  { value: "cerrado", label: "Cerrado" },
  { value: "procesado", label: "Procesado" },
];

interface AdminFiltersBarProps {
  filters: AdminFilters;
  sellers: SellerInfo[];
  showStatus?: boolean;
  exportHref?;
}

export function AdminFiltersBar({ filters, sellers, showStatus, exportHref }: AdminFiltersBarProps) {
  const { pathname } = useLocation();
  const qs = filtersToSearchParams(filters);

  return (
    <div className="admin-filters">
      <form method="GET" action={pathname} className="admin-filters-form">
        <div className="admin-filter-field">
          <label>Desde</label>
          <input type="date" name="from" defaultValue={filters.from ?? ""} className="auth-input" />
        </div>
        <div className="admin-filter-field">
          <label>Hasta</label>
          <input type="date" name="to" defaultValue={filters.to ?? ""} className="auth-input" />
        </div>
        <div className="admin-filter-field">
          <label>Vendedor</label>
          <select name="user" defaultValue={filters.userId ?? ""} className="auth-input">
            <option value="">Todos</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        {showStatus && (
          <div className="admin-filter-field">
            <label>Estado</label>
            <select name="status" defaultValue={filters.status ?? ""} className="auth-input">
              {STATUSES.map((s) => (
                <option key={s.value || "all"} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        )}
        <button type="submit" className="btn btn-primary">Filtrar</button>
        {qs && (
          <Link to={pathname} className="btn btn-ghost">Limpiar</Link>
        )}
      </form>
      {exportHref && (
        <a to={exportHref} className="btn btn-ghost admin-export-btn">Exportar CSV</a>
      )}
    </div>
  );
}
