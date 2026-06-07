import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorksheetDetail, prospectName } from "@/lib/admin/data";
import { requireAdminPermission } from "@/lib/admin/guard";
import { worksheetDisplayEntries } from "@/lib/calculations/worksheet-labels";
import { longDate } from "@/lib/format/dates";

export default async function AdminWorksheetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPermission("worksheets:read");
  const { id } = await params;
  const sheet = await getWorksheetDetail(id);
  if (!sheet) notFound();

  const entries = worksheetDisplayEntries(sheet.data);

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <Link href="/admin/worksheets" className="admin-back-link">← Worksheets</Link>
        <h1 className="admin-h1">Detalle worksheet</h1>
        <p className="admin-sub">
          {sheet.seller} · {prospectName(sheet.prospect)}
          {sheet.updated_at ? ` · Actualizada ${longDate(String(sheet.updated_at).slice(0, 10))}` : ""}
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
