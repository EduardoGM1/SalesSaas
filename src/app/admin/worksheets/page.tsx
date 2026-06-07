import Link from "next/link";
import { getWorksheets, getSellerOptions, prospectName } from "@/lib/admin/data";
import { parseAdminFilters } from "@/lib/admin/filters";
import { requireAdminPermission } from "@/lib/admin/guard";
import { AdminWorksheetsFilters } from "@/components/admin/admin-worksheets-filters";
import { fmtN } from "@/lib/format/money";
import { longDate } from "@/lib/format/dates";

export default async function AdminWorksheetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPermission("worksheets:read");
  const sp = await searchParams;
  const filters = parseAdminFilters(sp);
  const [sheets, sellers] = await Promise.all([
    getWorksheets(filters),
    getSellerOptions(),
  ]);
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
                    <Link href={`/admin/worksheets/${w.id}`} className="admin-row-link">
                      Ver detalle
                    </Link>
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
