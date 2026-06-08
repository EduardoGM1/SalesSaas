import { Link } from "react-router-dom";
import { AdminTrendChart } from "@/components/admin/admin-trend-chart.jsx";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { fmt, fmtN } from "@/lib/format/money";
import { longDate } from "@/lib/format/dates";

function prospectName(p) {
  if (!p) return "Libre";
  return p.name || p.name1 || p.prospect_code || "—";
}

export function AdminOverviewPage() {
  const { loading, data, error } = useAdminFetch("overview");

  if (loading) return <div className="admin-page">Cargando resumen…</div>;
  if (error) return <div className="admin-page admin-empty">{error}</div>;
  if (!data) return null;

  const kpis = [
    { label: "Usuarios", value: fmtN(data.usersCount) },
    { label: "Expedientes", value: fmtN(data.prospectsCount) },
    { label: "Ventas totales", value: fmtN(data.salesCount) },
    { label: "Volumen total", value: fmt(data.totalVolume) },
    { label: "Ventas del mes", value: fmtN(data.monthSalesCount) },
    { label: "Volumen del mes", value: fmt(data.monthVolume) },
  ];

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1 className="admin-h1">Resumen del sistema</h1>
        <p className="admin-sub">Vista general de la actividad de todos los vendedores.</p>
      </div>
      <div className="admin-kpis">
        {kpis.map((k) => (
          <div className="admin-kpi" key={k.label}>
            <div className="admin-kpi-label">{k.label}</div>
            <div className="admin-kpi-value">{k.value}</div>
          </div>
        ))}
      </div>
      <div className="client-table-card admin-chart-card">
        <div className="admin-card-head">Tendencia mensual (últimos 6 meses)</div>
        <AdminTrendChart data={data.trend} />
      </div>
      <div className="admin-grid2">
        <div className="client-table-card">
          <div className="admin-card-head">Top vendedores (por volumen)</div>
          {data.topSellers.length === 0 ? (
            <div className="admin-empty">Sin ventas registradas.</div>
          ) : (
            <table className="client-table">
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th style={{ textAlign: "right" }}>Ventas</th>
                  <th style={{ textAlign: "right" }}>Volumen</th>
                </tr>
              </thead>
              <tbody>
                {data.topSellers.map((s, i) => (
                  <tr key={i}>
                    <td>{s.name}</td>
                    <td style={{ textAlign: "right" }}>{fmtN(s.sales)}</td>
                    <td style={{ textAlign: "right" }}>{fmt(s.volume)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="client-table-card">
          <div className="admin-card-head">
            Ventas recientes
            <Link to="/admin/sales" className="admin-card-link">Ver todas →</Link>
          </div>
          {data.recentSales.length === 0 ? (
            <div className="admin-empty">Sin ventas registradas.</div>
          ) : (
            <table className="client-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Vendedor</th>
                  <th>Expediente</th>
                  <th style={{ textAlign: "right" }}>Volumen</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSales.map((s) => (
                  <tr key={s.id}>
                    <td>{s.sale_date ? longDate(s.sale_date) : "—"}</td>
                    <td>{s.seller}</td>
                    <td>{prospectName(s.prospect)}</td>
                    <td style={{ textAlign: "right" }}>{fmt(s.vol)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
