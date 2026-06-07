import { getActivities, getSellerOptions, prospectName } from "@/lib/admin/data";
import { requireAdminPermission } from "@/lib/admin/guard";
import { parseAdminFilters } from "@/lib/admin/filters";
import { AdminFiltersBar } from "@/components/admin/admin-filters-bar";
import { longDate } from "@/lib/format/dates";

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPermission("activity:read");
  const sp = await searchParams;
  const filters = parseAdminFilters(sp);
  const [activities, sellers] = await Promise.all([
    getActivities(filters),
    getSellerOptions(),
  ]);

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1 className="admin-h1">Actividad global</h1>
        <p className="admin-sub">Historial de actividad de todos los vendedores (últimas 500).</p>
      </div>

      <AdminFiltersBar filters={filters} sellers={sellers} />

      <div className="client-table-card">
        {activities.length === 0 ? (
          <div className="admin-empty">Sin actividad con estos filtros.</div>
        ) : (
          <table className="client-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Vendedor</th>
                <th>Tipo</th>
                <th>Título</th>
                <th>Expediente</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.activity_date
                      ? longDate(a.activity_date)
                      : a.created_at
                        ? longDate(String(a.created_at).slice(0, 10))
                        : "—"}
                  </td>
                  <td>{a.seller}</td>
                  <td>{a.type}</td>
                  <td>{a.title || "—"}</td>
                  <td>{prospectName(a.prospect)}</td>
                  <td className="admin-cell-note">{a.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
