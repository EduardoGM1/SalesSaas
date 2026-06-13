import { useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { SaleDetailModal } from "@/components/sales/sale-detail-modal.jsx";
import { useUserFeatures } from "@/hooks/use-user-features.js";
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

function saleMeta(sale, t) {
  const pending = sale.status === "no-procesable" || sale.processing === "pendiente";
  const fileLabel = sale.clientName || sale.prospectCode || t("salesHistory.archivedFile");
  const processingLabel = pending ? t("exp.sales.pending") : t("salesHistory.filters.processable");
  return { pending, fileLabel, processingLabel };
}

export function SalesHistoryPage() {
  const { t, lang } = useI18n();
  const { fmt, fmtN } = useMoney();
  const db = useDbStore((s) => s.db);
  const [searchParams] = useSearchParams();
  const [viewSaleId, setViewSaleId] = useState(null);
  const { canAccessSalesHistory, canViewSaleModal, canViewSaleDetail } = useUserFeatures();

  const filters = useMemo(() => ({
    status: searchParams.get("status") || undefined,
    processing: searchParams.get("processing") || undefined,
    from: searchParams.get("from") || undefined,
    to: searchParams.get("to") || undefined,
  }), [searchParams]);

  const sales = useMemo(() => filterSales(collectAllSales(db), filters), [db, filters]);
  const total = sales.reduce((acc, s) => acc + (s.vol || 0), 0);
  const qs = searchParams.toString();

  if (!canAccessSalesHistory) return <Navigate to="/" replace />;

  return (
    <>
      <Topbar title={t("page.sales.title")} subtitle={t("page.sales.subtitle")} />
      <div className="sales-page sales-history-page">
        <p className="sales-history-intro">{t("salesHistory.sub", { count: fmtN(sales.length), volume: fmt(total) })}</p>

        <div className="sales-history-filters admin-filters">
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
            <div className="sales-history-filter-actions">
              <button type="submit" className="btn btn-primary">{t("admin.filters.apply")}</button>
              {qs && <Link to="/sales" className="btn btn-ghost">{t("common.clear")}</Link>}
            </div>
          </form>
        </div>

        {sales.length === 0 ? (
          <div className="client-table-card sales-history-empty">
            <div className="admin-empty">{t("salesHistory.empty")}</div>
          </div>
        ) : (
          <>
            <div className="client-table-card sales-history-table-card">
              <table className="client-table sales-history-table">
                <thead>
                  <tr>
                    <th>{t("admin.table.date")}</th>
                    <th>{t("admin.table.file")}</th>
                    <th>{t("admin.table.contract")}</th>
                    <th>{t("admin.table.status")}</th>
                    <th>{t("salesHistory.filters.processing")}</th>
                    <th className="th-num">{t("admin.table.tours")}</th>
                    <th className="th-num">{t("admin.table.volume")}</th>
                    {canViewSaleModal && <th>{t("admin.users.col.actions")}</th>}
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => {
                    const { fileLabel, processingLabel } = saleMeta(s, t);
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
                        <td>{processingLabel}</td>
                        <td className="td-num">{fmtN(s.tours || 0)}</td>
                        <td className="td-num">{fmt(s.vol || 0)}</td>
                        {canViewSaleModal && (
                          <td>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setViewSaleId(s.saleId)}>{t("common.viewSale")}</button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="sales-history-cards">
              {sales.map((s) => {
                const { fileLabel, processingLabel } = saleMeta(s, t);
                return (
                  <article key={s.saleId} className="sales-history-card">
                    <div className="sales-history-card-top">
                      <div>
                        <div className="sales-history-card-date">{s.date ? longDate(s.date, lang) : "—"}</div>
                        <div className="sales-history-card-file">{fileLabel}</div>
                      </div>
                      <div className="sales-history-card-vol">{fmt(s.vol || 0)}</div>
                    </div>
                    <dl className="sales-history-card-meta">
                      <div><dt>{t("admin.table.contract")}</dt><dd>{s.contract || "—"}</dd></div>
                      <div><dt>{t("admin.table.status")}</dt><dd>{statusLabel(s.status, lang)}</dd></div>
                      <div><dt>{t("salesHistory.filters.processing")}</dt><dd>{processingLabel}</dd></div>
                      <div><dt>{t("admin.table.tours")}</dt><dd>{fmtN(s.tours || 0)}</dd></div>
                    </dl>
                    {canViewSaleModal && (
                      <button type="button" className="btn btn-ghost btn-sm sales-history-card-action" onClick={() => setViewSaleId(s.saleId)}>
                        {t("common.viewSale")}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>
      <SaleDetailModal
        open={!!viewSaleId}
        onOpenChange={(open) => { if (!open) setViewSaleId(null); }}
        saleId={viewSaleId}
        showTools={canViewSaleDetail}
      />
    </>
  );
}
