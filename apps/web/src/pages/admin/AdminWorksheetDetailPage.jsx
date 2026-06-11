import { Link, useParams } from "react-router-dom";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { worksheetDisplayEntries } from "@/lib/calculations/worksheet-labels";
import { useI18n } from "@/hooks/use-i18n.js";
import { longDate } from "@/lib/format/dates";

function prospectName(p) {
  if (!p) return "Libre";
  return p.name || p.name1 || p.prospect_code || "—";
}

export function AdminWorksheetDetailPage() {
  const { t, lang } = useI18n();
  const { id } = useParams();
  const { loading, data, error } = useAdminFetch(`worksheets/${id}`);

  if (loading) return <div className="admin-page">{t("admin.loading.worksheet")}</div>;
  if (error) return <div className="admin-page admin-empty">{error}</div>;
  if (!data) return <div className="admin-page admin-empty">{t("admin.worksheet.notFound")}</div>;

  const entries = worksheetDisplayEntries(data.data);

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <Link to="/admin/worksheets" className="admin-back-link">← Worksheets</Link>
        <h1 className="admin-h1">{t("admin.worksheetDetail.title")}</h1>
        <p className="admin-sub">
          {data.seller} · {prospectName(data.prospect)}
          {data.updated_at ? ` · ${longDate(String(data.updated_at).slice(0, 10), lang)}` : ""}
        </p>
      </div>
      <div className="client-table-card">
        {entries.length === 0 ? (
          <div className="admin-empty">{t("admin.worksheet.noFields")}</div>
        ) : (
          <table className="client-table admin-detail-table">
            <thead>
              <tr>
                <th>{t("admin.table.field")}</th>
                <th>{t("admin.table.value")}</th>
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
