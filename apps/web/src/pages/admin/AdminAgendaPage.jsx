import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminFiltersBar } from "@/components/admin/admin-filters-bar.jsx";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { agendaFileLabel, agendaProcessingLabel, agendaTypeLabel } from "@/lib/admin/agenda-labels.js";
import { parseAdminFilters } from "@/lib/admin/filters";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";
import { longDate } from "@/lib/format/dates";

export function AdminAgendaPage() {
  const { t, lang } = useI18n();
  const { fmt, fmtN } = useMoney();
  const [searchParams] = useSearchParams();
  const filters = useMemo(() => parseAdminFilters(Object.fromEntries(searchParams.entries())), [searchParams]);
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const entriesState = useAdminFetch("calendar", search);
  const sellersState = useAdminFetch("sellers");

  if (entriesState.loading || sellersState.loading) return <div className="admin-page">{t("admin.loading.agenda")}</div>;
  if (entriesState.error) return <div className="admin-page admin-empty">{entriesState.error}</div>;

  const entries = entriesState.data ?? [];
  const sellers = sellersState.data ?? [];

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1 className="admin-h1">{t("admin.agenda.title")}</h1>
        <p className="admin-sub">{t("admin.agenda.sub")}</p>
      </div>
      <AdminFiltersBar filters={filters} sellers={sellers} />
      <div className="client-table-card">
        {entries.length === 0 ? (
          <div className="admin-empty">{t("admin.agenda.empty")}</div>
        ) : (
          <table className="client-table">
            <thead>
              <tr>
                <th>{t("admin.table.date")}</th>
                <th>{t("admin.table.seller")}</th>
                <th>{t("admin.table.type")}</th>
                <th>{t("admin.table.file")}</th>
                <th>{t("admin.table.note")}</th>
                <th style={{ textAlign: "right" }}>{t("admin.table.volume")}</th>
                <th>{t("admin.agenda.processing")}</th>
                <th>{t("admin.agenda.completed")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{e.entry_date ? longDate(e.entry_date, lang) : "—"}</td>
                  <td>{e.seller}</td>
                  <td>{agendaTypeLabel(e, t)}</td>
                  <td>{agendaFileLabel(e, t)}</td>
                  <td>{e.note || "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    {e.vol != null ? fmt(e.vol) : e.tours != null ? fmtN(e.tours) : "—"}
                  </td>
                  <td>
                    {agendaProcessingLabel(e.processing, t)}
                    {e.process_date ? (
                      <span className="admin-cell-muted"> · {longDate(e.process_date, lang)}</span>
                    ) : null}
                  </td>
                  <td>{e.completed ? t("admin.worksheet.yes") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
