import { getCalendarEntries, getSellerOptions, prospectName } from "@/lib/admin/data";
import { requireAdminPermission } from "@/lib/admin/guard";
import { parseAdminFilters } from "@/lib/admin/filters";
import { AdminFiltersBar } from "@/components/admin/admin-filters-bar";
import { fmt } from "@/lib/format/money";
import { longDate } from "@/lib/format/dates";

const TYPE_LABEL: Record<string, string> = {
  tour: "Tour",
  venta: "Venta",
  bback: "B-back",
  descanso: "Descanso",
  libre: "Libre",
  otro: "Otro",
};

export default async function AdminAgendaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPermission("agenda:read");
  const sp = await searchParams;
  const filters = parseAdminFilters(sp);
  const [entries, sellers] = await Promise.all([
    getCalendarEntries(filters),
    getSellerOptions(),
  ]);

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
                  <td className="admin-cell-note">{e.note || "—"}</td>
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
