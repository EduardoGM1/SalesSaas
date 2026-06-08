import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminFiltersBar } from "@/components/admin/admin-filters-bar.jsx";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { parseAdminFilters, filtersToSearchParams } from "@/lib/admin/filters";
import { fmt, fmtN } from "@/lib/format/money";
import { longDate } from "@/lib/format/dates";
import { statusLabel } from "@/lib/format/status";

function prospectName(p) {
  if (!p) return "Libre";
  return p.name || p.name1 || p.prospect_code || "—";
}

export function AdminSalesPage() {
  const [searchParams] = useSearchParams();
  const filters = useMemo(() => parseAdminFilters(Object.fromEntries(searchParams.entries())), [searchParams]);
  const qs = searchParams.toString();
  const search = qs ? `?${qs}` : "";

  const salesState = useAdminFetch("sales", search);
  const sellersState = useAdminFetch("sellers");

  if (salesState.loading || sellersState.loading) return <div className="admin-page">Cargando ventas…</div>;
  if (salesState.error) return <div className="admin-page admin-empty">{salesState.error}</div>;

  const sales = salesState.data ?? [];
  const sellers = sellersState.data ?? [];
  const total = sales.reduce((acc, s) => acc + s.vol, 0);
  const exportHref = `/api/v1/admin/export/sales${filtersToSearchParams(filters)}`;

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1 className="admin-h1">Ventas</h1>
        <p className="admin-sub">{fmtN(sales.length)} venta(s) · Volumen total {fmt(total)}</p>
      </div>
      <AdminFiltersBar filters={filters} sellers={sellers} showStatus exportHref={exportHref} />
      <div className="client-table-card">
        {sales.length === 0 ? (
          <div className="admin-empty">Sin ventas con estos filtros.</div>
        ) : (
          <table className="client-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Vendedor</th>
                <th>Expediente</th>
                <th>Contrato</th>
                <th>Estado</th>
                <th style={{ textAlign: "right" }}>Tours</th>
                <th style={{ textAlign: "right" }}>Volumen</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id}>
                  <td>{s.sale_date ? longDate(s.sale_date) : "—"}</td>
                  <td>{s.seller}</td>
                  <td>{prospectName(s.prospect)}</td>
                  <td>{s.contract || "—"}</td>
                  <td>{statusLabel(s.status ?? undefined)}</td>
                  <td style={{ textAlign: "right" }}>{fmtN(s.tours)}</td>
                  <td style={{ textAlign: "right" }}>{fmt(s.vol)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
