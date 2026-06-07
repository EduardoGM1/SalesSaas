import Link from "next/link";
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
  const qs = filtersToSearchParams(filters);

  return (
    <div className="admin-filters">
      <form method="GET" action="/admin/worksheets" className="admin-filters-form">
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
        <button type="submit" className="btn btn-primary">Filtrar</button>
        {qs && <Link href="/admin/worksheets" className="btn btn-ghost">Limpiar</Link>}
      </form>
    </div>
  );
}
