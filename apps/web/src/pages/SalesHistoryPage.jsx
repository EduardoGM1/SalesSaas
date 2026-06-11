import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Topbar } from "@/components/layout/topbar";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";
import { longDate } from "@/lib/format/dates";
import { statusLabel } from "@/lib/format/status";
import { collectAllSales, filterSales } from "@/lib/sales/collect";
import { useDbStore } from "@/stores/db-store";

const STATUS_OPTIONS = [
  { value: "", key: "salesHistory.filters.allStatuses" },
  { value: "venta", key: "status.sale" },
  { value: "bback", key: "status.bback" },
  { value: "procesable", key: "status.processable" },
  { value: "no-procesable", key: "status.notProcessable" },
  { value: "perdido", key: "status.lost" },
  { value: "cerrado", key: "status.closed" },
  { value: "procesado", key: "status.processed" },
];

const PROCESSING_OPTIONS = [
  { value: "", key: "salesHistory.filters.allProcessing" },
  { value: "procesable", key: "salesHistory.filters.processable" },
  { value: "pendiente", key: "salesHistory.filters.pending" },
];

export function SalesHistoryPage() {
  const { t, lang } = useI18n();
  const { fmt, fmtN } = useMoney();
  const db = useDbStore((s) => s.db);
  const [searchParams] = useSearchParams();

  const filters = useMemo(() => ({
    status: searchParams.get("status") || undefined,
    processing: searchParams.get("processing") || undefined,
    from: searchParams.get("from") || undefined,
    to: searchParams.get("to") || undefined,
  }), [searchParams]);

  const sales = useMemo(() => filterSales(collectAllSales(db), filters), [db, filters]);
  const total = sales.reduce((acc, s) => acc + (s.vol || 0), 0);
  const qs = searchParams.toString();

  return (
    <>
      <Topbar title={t("page.sales.title")} subtitle={t("page.sales.subtitle")} />
      <div className="page-body">
        <p className="page-intro">{t("salesHistory.sub", { count: fmtN(sales.length), volume: fmt(total) })}</p>

        <div className="admin-filters">
          <form method="GET" action="/sales" className="admin-filters-form">
            <div className="admin-filter-field">
              <label>{t("admin.filters.from")}</label>
              <input type="date" name="from" defaultValue={filters.from ?? ""} className="auth-input" />
            </div>
            <div className="admin-filter-field">
              <label>{t("admin.filters.to")}</label>
              <input type="date" name="to" defaultValue={filters.to ?? ""} className="auth-input" />
            </div>
            <div className="admin-filter-field">
              <label>{t("admin.filters.status")}</label>
              <select name="status" defaultValue={filters.status ?? ""} className="auth-input">
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value || "all"} value={s.value}>{t(s.key)}</option>
                ))}
              </select>
            </div>
            <div className="admin-filter-field">
              <label>{t("salesHistory.filters.processing")}</label>
              <select name="processing" defaultValue={filters.processing ?? ""} className="auth-input">
                {PROCESSING_OPTIONS.map((s) => (
                  <option key={s.value || "all"} value={s.value}>{t(s.key)}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary">{t("admin.filters.apply")}</button>
            {qs && <Link to="/sales" className="btn btn-ghost">{t("common.clear")}</Link>}
          </form>
        </div>

        <div className="client-table-card">
          {sales.length === 0 ? (
            <div className="admin-empty">{t("salesHistory.empty")}</div>
          ) : (
            <table className="client-table">
              <thead>
                <tr>
                  <th>{t("admin.table.date")}</th>
                  <th>{t("admin.table.file")}</th>
                  <th>{t("admin.table.contract")}</th>
                  <th>{t("admin.table.status")}</th>
                  <th>{t("salesHistory.filters.processing")}</th>
                  <th style={{ textAlign: "right" }}>{t("admin.table.tours")}</th>
                  <th style={{ textAlign: "right" }}>{t("admin.table.volume")}</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => {
                  const pending = s.status === "no-procesable" || s.processing === "pendiente";
                  const fileLabel = s.clientName || s.prospectCode || t("salesHistory.archivedFile");
                  return (
                    <tr key={s.saleId}>
                      <td>{s.date ? longDate(s.date, lang) : "—"}</td>
                      <td>
                        {s.clientId && !s.orphaned ? (
                          <Link to={`/clients/${s.clientId}`} className="dg-link">{fileLabel}</Link>
                        ) : (
                          <span title={t("salesHistory.archivedHint")}>{fileLabel}</span>
                        )}
                      </td>
                      <td>{s.contract || "—"}</td>
                      <td>{statusLabel(s.status, lang)}</td>
                      <td>
                        {pending ? t("exp.sales.pending") : t("salesHistory.filters.processable")}
                      </td>
                      <td style={{ textAlign: "right" }}>{fmtN(s.tours || 0)}</td>
                      <td style={{ textAlign: "right" }}>{fmt(s.vol || 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
