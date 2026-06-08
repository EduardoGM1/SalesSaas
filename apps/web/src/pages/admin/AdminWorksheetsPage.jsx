import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AdminWorksheetsFilters } from "@/components/admin/admin-worksheets-filters.jsx";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { parseAdminFilters } from "@/lib/admin/filters";
import { fmtN } from "@/lib/format/money";
import { longDate } from "@/lib/format/dates";

function prospectName(p) {
  if (!p) return "Libre";
  return p.name || p.name1 || p.prospect_code || "—";
}

export function AdminWorksheetsPage() {
  const [searchParams] = useSearchParams();
  const filters = useMemo(() => parseAdminFilters(Object.fromEntries(searchParams.entries())), [searchParams]);
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const sheetsState = useAdminFetch("worksheets", search);
  const sellersState = useAdminFetch("sellers");

  if (sheetsState.loading || sellersState.loading) return <div className="admin-page">Cargando worksheets…</div>;
  if (sheetsState.error) return <div className="admin-page admin-empty">{sheetsState.error}</div>;

  const sheets = sheetsState.data ?? [];
  const sellers = sellersState.data ?? [];
  const hasFilters = Boolean(filters.from || filters.to || filters.userId);

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1 className="admin-h1">Worksheets</h1>
        <p className="admin-sub">
          {fmtN(sheets.length)} hoja(s){hasFilters ? " con estos filtros" : " de financiamiento"}.
        </p>
      </div>
      <AdminWorksheetsFilters filters={filters} sellers={sellers} />
      <div className="client-table-card">
        {sheets.length === 0 ? (
          <div className="admin-empty">
            {hasFilters ? "Sin worksheets que coincidan con los filtros." : "Sin worksheets guardadas."}
          </div>
        ) : (
          <table className="client-table">
            <thead>
              <tr>
                <th>Vendedor</th>
                <th>Expediente</th>
                <th style={{ textAlign: "right" }}>Campos</th>
                <th>Actualizada</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sheets.map((w) => (
                <tr key={w.id}>
                  <td>{w.seller}</td>
                  <td>{prospectName(w.prospect)}</td>
                  <td style={{ textAlign: "right" }}>{fmtN(w.fields)}</td>
                  <td>{w.updated_at ? longDate(String(w.updated_at).slice(0, 10)) : "—"}</td>
                  <td>
                    <Link to={`/admin/worksheets/${w.id}`} className="admin-row-link">Ver detalle</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
