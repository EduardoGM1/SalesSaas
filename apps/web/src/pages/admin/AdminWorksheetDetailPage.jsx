import { Link, useParams } from "react-router-dom";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { worksheetDisplayEntries } from "@/lib/calculations/worksheet-labels";
import { longDate } from "@/lib/format/dates";

function prospectName(p) {
  if (!p) return "Libre";
  return p.name || p.name1 || p.prospect_code || "—";
}

export function AdminWorksheetDetailPage() {
  const { id } = useParams();
  const { loading, data, error } = useAdminFetch(`worksheets/${id}`);

  if (loading) return <div className="admin-page">Cargando worksheet…</div>;
  if (error) return <div className="admin-page admin-empty">{error}</div>;
  if (!data) return <div className="admin-page admin-empty">Worksheet no encontrado.</div>;

  const entries = worksheetDisplayEntries(data.data);

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <Link to="/admin/worksheets" className="admin-back-link">← Worksheets</Link>
        <h1 className="admin-h1">Detalle worksheet</h1>
        <p className="admin-sub">
          {data.seller} · {prospectName(data.prospect)}
          {data.updated_at ? ` · Actualizada ${longDate(String(data.updated_at).slice(0, 10))}` : ""}
        </p>
      </div>
      <div className="client-table-card">
        {entries.length === 0 ? (
          <div className="admin-empty">Sin campos guardados.</div>
        ) : (
          <table className="client-table admin-detail-table">
            <thead>
              <tr>
                <th>Campo</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((row) => (
                <tr key={row.key}>
                  <td className="admin-detail-key">{row.label}</td>
                  <td>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
