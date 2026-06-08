import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminFiltersBar } from "@/components/admin/admin-filters-bar.jsx";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { parseAdminFilters } from "@/lib/admin/filters";
import { fmt } from "@/lib/format/money";
import { longDate } from "@/lib/format/dates";

const TYPE_LABEL = {
  tour: "Tour",
  venta: "Venta",
  bback: "B-back",
  descanso: "Descanso",
  libre: "Libre",
  otro: "Otro",
};

function prospectName(p) {
  if (!p) return "Libre";
  return p.name || p.name1 || p.prospect_code || "—";
}

export function AdminAgendaPage() {
  const [searchParams] = useSearchParams();
  const filters = useMemo(() => parseAdminFilters(Object.fromEntries(searchParams.entries())), [searchParams]);
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const entriesState = useAdminFetch("calendar", search);
  const sellersState = useAdminFetch("sellers");

  if (entriesState.loading || sellersState.loading) return <div className="admin-page">Cargando agenda…</div>;
  if (entriesState.error) return <div className="admin-page admin-empty">{entriesState.error}</div>;

  const entries = entriesState.data ?? [];
  const sellers = sellersState.data ?? [];

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1 className="admin-h1">Agenda global</h1>
        <p className="admin-sub">Calendario de todos los vendedores (últimas 500 entradas).</p>
      </div>
      <AdminFiltersBar filters={filters} sellers={sellers} />
      <div className="client-table-card">
        {entries.length === 0 ? (
          <div className="admin-empty">Sin entradas con estos filtros.</div>
        ) : (
          <table className="client-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Vendedor</th>
                <th>Tipo</th>
                <th>Expediente</th>
                <th>Nota</th>
                <th style={{ textAlign: "right" }}>Volumen</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{e.entry_date ? longDate(e.entry_date) : "—"}</td>
                  <td>{e.seller}</td>
                  <td>{TYPE_LABEL[e.type] ?? e.type}</td>
                  <td>{prospectName(e.prospect)}</td>
                  <td>{e.note || "—"}</td>
                  <td style={{ textAlign: "right" }}>{e.vol != null ? fmt(e.vol) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
