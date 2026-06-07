import { getSales, getSellerOptions, prospectName } from "@/lib/admin/data";
import { parseAdminFilters, filtersToSearchParams } from "@/lib/admin/filters";
import { requireAdminPermission } from "@/lib/admin/guard";
import { AdminFiltersBar } from "@/components/admin/admin-filters-bar";
import { fmt, fmtN } from "@/lib/format/money";
import { longDate } from "@/lib/format/dates";
import { statusLabel } from "@/lib/format/status";

export default async function AdminSalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPermission("sales:read");
  const sp = await searchParams;
  const filters = parseAdminFilters(sp);
  const [sales, sellers] = await Promise.all([getSales(filters), getSellerOptions()]);
  const total = sales.reduce((acc, s) => acc + s.vol, 0);
  const exportHref = `/admin/export/sales${filtersToSearchParams(filters)}`;

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
