import { getGoals, getSellerOptions } from "@/lib/admin/data";
import { requireAdminPermission } from "@/lib/admin/guard";
import { parseAdminFilters } from "@/lib/admin/filters";
import { AdminFiltersBar } from "@/components/admin/admin-filters-bar";
import { fmt, fmtN } from "@/lib/format/money";

const MONTHS = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export default async function AdminGoalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPermission("goals:read");
  const sp = await searchParams;
  const filters = parseAdminFilters(sp);
  const [goals, sellers] = await Promise.all([getGoals(filters), getSellerOptions()]);

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1 className="admin-h1">Metas globales</h1>
        <p className="admin-sub">Metas mensuales de todos los vendedores.</p>
      </div>

      <AdminFiltersBar filters={filters} sellers={sellers} />

      <div className="client-table-card">
        {goals.length === 0 ? (
          <div className="admin-empty">Sin metas registradas.</div>
        ) : (
          <table className="client-table">
            <thead>
              <tr>
                <th>Vendedor</th>
                <th>Periodo</th>
                <th style={{ textAlign: "right" }}>Volumen</th>
                <th style={{ textAlign: "right" }}>Tours</th>
                <th style={{ textAlign: "right" }}>Ventas</th>
                <th style={{ textAlign: "right" }}>Días</th>
                <th style={{ textAlign: "right" }}>Descansos</th>
              </tr>
            </thead>
            <tbody>
              {goals.map((g) => (
                <tr key={`${g.user_id}-${g.year}-${g.month}`}>
                  <td>{g.seller}</td>
                  <td>{MONTHS[g.month]} {g.year}</td>
                  <td style={{ textAlign: "right" }}>{fmt(g.vol)}</td>
                  <td style={{ textAlign: "right" }}>{fmtN(g.tours)}</td>
                  <td style={{ textAlign: "right" }}>{fmtN(g.ventas)}</td>
                  <td style={{ textAlign: "right" }}>{fmtN(g.dias)}</td>
                  <td style={{ textAlign: "right" }}>{fmtN(g.descansos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
