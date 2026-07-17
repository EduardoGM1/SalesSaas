
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { Eye, Share2, Trash2 } from "lucide-react";
import { ShareProspectModal } from "@/components/network/share-prospect-modal.jsx";
import { NewClientModal } from "@/components/clients/new-client-modal.jsx";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { sharingApi } from "@/lib/network-api.js";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back";
import { clientDisplayName } from "@/lib/clients";
import { isQuantifiableSaleClient } from "@/lib/calculations/tour-summary";
import { shortDate } from "@/lib/format/dates";
import { useI18n } from "@/hooks/use-i18n.js";
import { selectOnFocus } from "@/lib/focus-select.js";
import { useAppStore } from "@/stores/app-store";
import { useClientActions } from "@/hooks/use-client-actions.js";

/** Solo el valor de catálogo (Q, NQ, CT, Member…); sin sufijo "- 1" / "- 0". */
function formatQualification(tipoTour) {
  if (!tipoTour) return "—";
  const cleaned = String(tipoTour).replace(/\s*[-–]\s*\d+\s*$/u, "").trim();
  return cleaned || "—";
}

function pinnedToRow(share) {
  const name = share.prospect_name || "—";
  return {
    id: share.prospect_id,
    prospectCode: share.prospect_code || "",
    name,
    name1: name,
    tourDate: share.tour_date || null,
    createdYmd: share.tour_date || null,
    tipo_tour: null,
    tour_cuantificable: true,
    pinned: true,
    shareId: share.id,
    href: share.href || `/red/contacto/${share.owner_id}/expediente/${share.prospect_id}`,
    permission: share.permission,
  };
}

function matchesQuery(row, q) {
  if (!q) return true;
  const hay = [
    row.name,
    row.name1,
    row.prospectCode,
    row.tipo_tour,
    row.tourDate,
    row.city,
    row.country,
    row.status,
  ].filter(Boolean).join(" ").toLowerCase();
  return hay.includes(q);
}

export function ClientsPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const hydrated = useAppStore((s) => s.hydrated);
  const { searchClients, removeClient } = useClientActions();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [shareClient, setShareClient] = useState(null);
  const [pinned, setPinned] = useState([]);
  const canShare = isSupabaseConfigured();

  useEffect(() => {
    if (!canShare || !hydrated) return;
    let active = true;
    sharingApi.listWorkspace()
      .then((rows) => {
        if (!active) return;
        setPinned(Array.isArray(rows) ? rows.map(pinnedToRow) : []);
      })
      .catch(() => {
        if (active) setPinned([]);
      });
    return () => { active = false; };
  }, [canShare, hydrated]);

  const ownedAll = searchClients("");
  const ownedIds = useMemo(() => new Set(ownedAll.map((c) => c.id)), [ownedAll]);
  const pinnedOnly = useMemo(
    () => pinned.filter((p) => !ownedIds.has(p.id)),
    [pinned, ownedIds],
  );

  const q = query.trim().toLowerCase();
  const ownedSorted = searchClients(query);
  const pinnedSorted = useMemo(
    () => pinnedOnly.filter((p) => matchesQuery(p, q)),
    [pinnedOnly, q],
  );
  const allRows = useMemo(() => [...ownedSorted, ...pinnedSorted], [ownedSorted, pinnedSorted]);
  const totalCount = ownedAll.length + pinnedOnly.length;
  const hasSearch = query.trim().length > 0;

  if (!hydrated) return <Topbar title={t("page.clients.title")} subtitle={t("common.loading")} />;

  const handleRowClick = (row, event) => {
    if (!window.matchMedia("(max-width: 768px)").matches) return;
    if (event.target.closest(".client-actions")) return;
    navigate(row.pinned ? row.href : `/clients/${row.id}`);
  };

  return (
    <>
      <Topbar title={t("page.clients.title")} subtitle={t("page.clients.subtitle")} />
      <div className="sales-page clients-page">
        <div className="page-toolbar page-toolbar--between">
          <PageBack inline />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>{t("clients.new")}</button>
        </div>

        <div className="client-search-card">
          <div className="client-search-row">
            <div className="client-search-input-wrap">
              <input
                type="search"
                className="client-search-input"
                placeholder={t("clients.searchPlaceholder")}
                value={query}
                onFocus={selectOnFocus}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQuery("")}>{t("common.clear")}</button>
            <div className="client-search-count">
              {hasSearch
                ? t("clients.filesCount", { shown: allRows.length, total: totalCount })
                : t("clients.filesTotal", { total: totalCount })}
            </div>
          </div>
          <div className="client-search-help">{t("clients.searchHelp")}</div>
        </div>

        {!totalCount ? (
          <div className="client-empty">{t("clients.emptyCreate")}</div>
        ) : !allRows.length ? (
          <div className="client-search-empty">{t("clients.noResults", { query })}</div>
        ) : (
          <div className="client-table-card">
            <table className="client-table">
              <thead>
                <tr>
                  <th>{t("clients.colName")}</th>
                  <th>{t("clients.colDate")}</th>
                  <th>{t("clients.colTourType")}</th>
                  <th style={{ textAlign: "center" }}>{t("clients.colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {allRows.map((c) => {
                  const href = c.pinned ? c.href : `/clients/${c.id}`;
                  // Misma fuente de verdad que el recuadro Ventas del Dashboard.
                  const hasRecognizedSale = !c.pinned && isQuantifiableSaleClient(c);
                  const nameClass = hasRecognizedSale
                    ? "client-name-text client-name-text--sale"
                    : "client-name-text";
                  return (
                    <tr
                      key={c.pinned ? `pin-${c.shareId || c.id}` : c.id}
                      className="client-table-row"
                      onClick={(e) => handleRowClick(c, e)}
                    >
                      <td>
                        <Link
                          to={href}
                          className="client-name-link client-name-link--desktop"
                        >
                          <span className={nameClass}>
                            {clientDisplayName(c)}
                            {c.pinned && (
                              <span className="client-status-badge">{t("clients.pinnedBadge")}</span>
                            )}
                          </span>
                          <span className="client-code">{c.prospectCode}</span>
                        </Link>
                        <div className="client-name-link client-name-link--mobile">
                          <span className={nameClass}>
                            {clientDisplayName(c)}
                            {c.pinned && (
                              <span className="client-status-badge">{t("clients.pinnedBadge")}</span>
                            )}
                          </span>
                          <span className="client-code">{c.prospectCode}</span>
                        </div>
                      </td>
                      <td>{c.tourDate ? shortDate(c.tourDate, lang) : c.createdYmd ? shortDate(c.createdYmd, lang) : "—"}</td>
                      <td>{formatQualification(c.tipo_tour)}</td>
                      <td>
                        <div className="client-actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                          <Link to={href} className="icon-btn client-action-view" title={t("clients.viewFile")}><Eye size={14} /></Link>
                          {!c.pinned && canShare && (
                            <button
                              type="button"
                              className="icon-btn"
                              title={t("clients.share")}
                              onClick={() => setShareClient(c)}
                            >
                              <Share2 size={14} />
                            </button>
                          )}
                          {!c.pinned && (
                            <button type="button" className="icon-btn danger" title={t("clients.delete")} onClick={async () => {
                              await removeClient(c.id, clientDisplayName(c));
                            }}><Trash2 size={14} color="#dc2626" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {canShare && (
        <ShareProspectModal
          open={!!shareClient}
          onOpenChange={(open) => { if (!open) setShareClient(null); }}
          prospectId={shareClient?.id}
          prospectName={shareClient ? clientDisplayName(shareClient) : ""}
          prospect={shareClient}
        />
      )}

      <NewClientModal
        open={open}
        onOpenChange={setOpen}
        onCreated={(client) => navigate(`/clients/${client.id}`)}
      />
    </>
  );
}
