import Link from "next/link";
import { getOverview, prospectName } from "@/lib/admin/data";
import { requireAdminPermission } from "@/lib/admin/guard";
import { AdminTrendChart } from "@/components/admin/admin-trend-chart";
import { fmt, fmtN } from "@/lib/format/money";
import { longDate } from "@/lib/format/dates";

export default async function AdminOverviewPage() {
  await requireAdminPermission("dashboard:read");
  const o = await getOverview();

  const kpis = [
    { label: "Usuarios", value: fmtN(o.usersCount) },
    { label: "Expedientes", value: fmtN(o.prospectsCount) },
    { label: "Ventas totales", value: fmtN(o.salesCount) },
    { label: "Volumen total", value: fmt(o.totalVolume) },
    { label: "Ventas del mes", value: fmtN(o.monthSalesCount) },
    { label: "Volumen del mes", value: fmt(o.monthVolume) },
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
        <AdminTrendChart data={o.trend} />
      </div>

      <div className="admin-grid2">
        <div className="client-table-card">
          <div className="admin-card-head">Top vendedores (por volumen)</div>
          {o.topSellers.length === 0 ? (
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
                {o.topSellers.map((s, i) => (
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
            <Link href="/admin/sales" className="admin-card-link" prefetch>Ver todas →</Link>
          </div>
          {o.recentSales.length === 0 ? (
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
                {o.recentSales.map((s) => (
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
