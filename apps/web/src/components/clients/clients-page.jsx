
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Share2, Trash2 } from "lucide-react";
import { ShareProspectModal } from "@/components/network/share-prospect-modal.jsx";
import { NewClientModal } from "@/components/clients/new-client-modal.jsx";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import { removeChannelSafe } from "@/lib/presence/realtime.js";
import { sharingApi } from "@/lib/network-api.js";
import { participantsApi } from "@/lib/participants-api.js";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back";
import { clientDisplayName } from "@/lib/clients";
import { isQuantifiableSaleClient } from "@/lib/calculations/tour-summary";
import { shortDate } from "@/lib/format/dates";
import { useI18n } from "@/hooks/use-i18n.js";
import { useWorkspace } from "@/hooks/use-workspace.js";
import { selectOnFocus } from "@/lib/focus-select.js";
import { useAppStore } from "@/stores/app-store";
import { useDbStore } from "@/stores/db-store";
import { runWithoutOutboundSync } from "@/lib/sync-suspend.js";
import { useClientActions } from "@/hooks/use-client-actions.js";
import { requestSyncRefresh } from "@/lib/sync-refresh.js";
import { mirrorClientsWithCloud } from "@/lib/clients-mirror.js";
import { toast } from "@/lib/toast";

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
    tipo_tour: share.tipo_tour ?? null,
    tour_cuantificable: share.tour_cuantificable != null ? !!share.tour_cuantificable : true,
    pinned: true,
    shareId: share.id,
    href: share.href || `/red/contacto/${share.owner_id}/expediente/${share.prospect_id}`,
    permission: share.permission,
  };
}

function formatTeamActivity(meta, t, lang) {
  if (!meta?.lastActivityAt) return "—";
  const when = new Date(meta.lastActivityAt).toLocaleString(lang === "en" ? "en-US" : "es-MX");
  if (meta.lastActivityBy) {
    return t("clients.updatedBy", { name: meta.lastActivityBy, when });
  }
  return when;
}

function matchesQuery(row, q, showTeamCols) {
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
    showTeamCols && row.team?.vendedor,
    showTeamCols && row.team?.cerrador,
    showTeamCols && row.team?.lastActivityBy,
  ].filter(Boolean).join(" ").toLowerCase();
  return hay.includes(q);
}

function clientListYmd(c) {
  return c.tourDate || c.createdYmd || "";
}

function enrichWithTeam(row, teamMetaById) {
  const team = teamMetaById[row.id];
  return team ? { ...row, team } : row;
}

function prospectRowToClient(p, existing) {
  const base = existing || {
    data: { survey: {}, vacaciones: {}, worksheet: {} },
    sales: [],
    activities: [],
  };
  return {
    ...base,
    id: p.id,
    prospectId: p.id,
    ownerUserId: p.user_id ?? base.ownerUserId,
    prospectCode: p.prospect_code ?? base.prospectCode,
    name: p.name ?? base.name,
    name1: p.name1 ?? base.name1,
    name2: p.name2 ?? base.name2,
    city: p.city ?? base.city,
    country: p.country ?? base.country,
    phone: p.phone ?? base.phone,
    email: p.email ?? base.email,
    contract: p.contract ?? base.contract,
    status: p.status ?? base.status,
    tourDate: p.tour_date ?? base.tourDate,
    processDate: p.process_date ?? base.processDate,
    processAmount: p.process_amount != null ? Number(p.process_amount) : base.processAmount,
    note: p.note ?? base.note,
    tipo_tour: p.tipo_tour ?? base.tipo_tour,
    tour_cuantificable: p.tour_cuantificable != null ? !!p.tour_cuantificable : base.tour_cuantificable,
    completedExpedient: p.completed != null ? !!p.completed : base.completedExpedient,
    quickExpedient: p.quick_expedient != null ? !!p.quick_expedient : base.quickExpedient,
    createdAt: p.created_at ? Date.parse(p.created_at) || base.createdAt : base.createdAt,
    updatedAt: p.updated_at
      ? Date.parse(p.updated_at) || base.updatedAt
      : (p.created_at ? Date.parse(p.created_at) || base.updatedAt : base.updatedAt),
    createdYmd: p.created_at ? String(p.created_at).slice(0, 10) : base.createdYmd,
    date: p.created_at ? String(p.created_at).slice(0, 10) : base.date,
  };
}

const CLIENTS_PAGE_SIZE = 50;

export function ClientsPage() {
  const { t, lang, months } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { active, ready: workspaceReady } = useWorkspace();
  const hydrated = useAppStore((s) => s.hydrated);
  const { searchClients, removeClient } = useClientActions();
  const saveClient = useDbStore((s) => s.saveClient);
  const getClient = useDbStore((s) => s.getClient);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [shareClient, setShareClient] = useState(null);
  const [pinned, setPinned] = useState([]);
  const [teamMetaById, setTeamMetaById] = useState({});
  const [visibleLimit, setVisibleLimit] = useState(CLIENTS_PAGE_SIZE);
  const [remoteTotal, setRemoteTotal] = useState(null);
  const [remoteOffset, setRemoteOffset] = useState(0);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [listError, setListError] = useState(null);
  const canShare = isSupabaseConfigured();
  const isSalaWorkspace = active?.tipo === "sala_de_venta";
  const showTeamCols = isSalaWorkspace && canShare;
  const tableColSpan = showTeamCols ? 7 : 4;
  const currentYear = new Date().getFullYear();
  const workspaceLabel = active?.nombre || active?.name || null;

  const fetchProspectPage = useCallback(async (offset) => {
    if (!canShare) return { rows: [], total: 0 };
    const res = await fetch(`/api/v1/prospects?limit=${CLIENTS_PAGE_SIZE}&offset=${offset}`, {
      credentials: "include",
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Error al cargar clientes");
    const rows = Array.isArray(body.data) ? body.data : [];
    const total = Number(body.total) || 0;
    runWithoutOutboundSync(() => {
    for (const row of rows) {
      if (!row?.id) continue;
      saveClient(prospectRowToClient(row, getClient(row.id)), { skipCloud: true });
    }
    });
    return { rows, total };
  }, [canShare, getClient, saveClient]);

  const refreshPinned = useCallback(() => {
    if (!canShare) return Promise.resolve();
    return sharingApi.listWorkspace()
      .then((rows) => {
        setPinned(Array.isArray(rows) ? rows.map(pinnedToRow) : []);
      })
      .catch(() => {
        setPinned([]);
      });
  }, [canShare]);

  const refreshTeamMeta = useCallback(() => {
    if (!showTeamCols) {
      setTeamMetaById({});
      return Promise.resolve();
    }
    return participantsApi.active()
      .then((items) => {
        const map = {};
        for (const row of Array.isArray(items) ? items : []) {
          if (!row?.prospect_id) continue;
          map[row.prospect_id] = {
            vendedor: row.representante?.full_name || "—",
            cerrador: row.cerrador?.full_name || t("clients.unassignedCloser"),
            lastActivityBy: row.last_activity_by || null,
            lastActivityAt: row.last_activity_at || row.updated_at || null,
          };
        }
        setTeamMetaById(map);
      })
      .catch(() => setTeamMetaById({}));
  }, [showTeamCols, t]);

  useEffect(() => {
    if (!canShare || !hydrated) return;
    refreshPinned();
    refreshTeamMeta();
  }, [canShare, hydrated, location.key, refreshPinned, refreshTeamMeta]);

  useEffect(() => {
    if (!canShare || !hydrated || !workspaceReady) return;
    let cancelled = false;
    setRemoteOffset(0);
    setRemoteLoading(true);
    setListError(null);

    (async () => {
      try {
        // 1) Pull sync (encolado si hay otro en vuelo)
        await requestSyncRefresh({ force: true, reason: "clients-page" });
        if (cancelled) return;
        // 2) Espejo REST: bajar nube → store + subir solo-locales
        const mirror = await mirrorClientsWithCloud();
        if (cancelled) return;
        setRemoteTotal(mirror.remoteTotal);
        if (mirror.posted?.length) {
          toast.success(
            mirror.posted.length === 1
              ? "1 expediente local se guardó en la nube"
              : `${mirror.posted.length} expedientes locales se guardaron en la nube`,
          );
        }
        if (mirror.failed?.length) {
          toast.error(`No se pudieron subir ${mirror.failed.length} expediente(s) a la nube`);
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setListError(msg);
        setRemoteTotal(null);
        // Fallback: intentar página simple
        try {
          const { total } = await fetchProspectPage(0);
          if (!cancelled) setRemoteTotal(total);
        } catch {
          /* keep error */
        }
      } finally {
        if (!cancelled) setRemoteLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [canShare, hydrated, workspaceReady, location.key, active?.id, fetchProspectPage]);

  useEffect(() => {
    if (!canShare || !hydrated || !workspaceReady) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      refreshPinned();
      refreshTeamMeta();
      setRemoteOffset(0);
      setRemoteLoading(true);
      setListError(null);
      mirrorClientsWithCloud()
        .then((mirror) => setRemoteTotal(mirror.remoteTotal))
        .catch((err) => {
          setListError(err instanceof Error ? err.message : String(err));
          setRemoteTotal(null);
        })
        .finally(() => setRemoteLoading(false));
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [canShare, hydrated, workspaceReady, refreshPinned, refreshTeamMeta]);

  const pinnedIdsKey = useMemo(
    () => pinned.map((p) => p.id).filter(Boolean).sort().join(","),
    [pinned],
  );

  // Realtime: si el dueño cambia tipo_tour (u otros campos) del prospecto
  // referenciado, refrescar "En Mi Espacio" sin esperar a cambiar de pestaña.
  useEffect(() => {
    if (!canShare || !hydrated || !pinnedIdsKey) return undefined;
    const pinnedIds = new Set(pinnedIdsKey.split(","));

    let cancelled = false;
    let channel = null;
    const supabase = createClient();
    let refreshTimer = null;
    const scheduleRefresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshPinned();
      }, 350);
    };

    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user?.id) return;
      channel = supabase
        .channel(`clients-pinned-prospects:${user.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "prospects" },
          (payload) => {
            const id = payload.new?.id;
            if (id && pinnedIds.has(id)) scheduleRefresh();
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      clearTimeout(refreshTimer);
      if (channel) void removeChannelSafe(supabase, channel);
    };
  }, [canShare, hydrated, pinnedIdsKey, refreshPinned]);

  const ownedAll = searchClients("");
  const ownedIds = useMemo(() => new Set(ownedAll.map((c) => c.id)), [ownedAll]);
  const pinnedOnly = useMemo(
    () => pinned.filter((p) => !ownedIds.has(p.id)),
    [pinned, ownedIds],
  );

  const q = query.trim().toLowerCase();
  const ownedSorted = useMemo(
    () => ownedAll.filter((c) => matchesQuery(enrichWithTeam(c, teamMetaById), q, showTeamCols)),
    [ownedAll, q, teamMetaById, showTeamCols],
  );
  const pinnedSorted = useMemo(
    () => pinnedOnly
      .map((p) => enrichWithTeam(p, teamMetaById))
      .filter((p) => matchesQuery(p, q, showTeamCols)),
    [pinnedOnly, q, teamMetaById, showTeamCols],
  );
  const allRows = useMemo(
    () => [...ownedSorted, ...pinnedSorted].map((row) => enrichWithTeam(row, teamMetaById)),
    [ownedSorted, pinnedSorted, teamMetaById],
  );
  const visibleRows = useMemo(
    () => allRows.slice(0, visibleLimit),
    [allRows, visibleLimit],
  );
  const localOwnedCount = ownedAll.length;
  const totalCount = Math.max(remoteTotal ?? localOwnedCount, localOwnedCount) + pinnedOnly.length;
  const hasSearch = query.trim().length > 0;
  const canFetchMoreRemote = canShare
    && remoteTotal != null
    && remoteOffset + CLIENTS_PAGE_SIZE < remoteTotal;

  useEffect(() => {
    setVisibleLimit(CLIENTS_PAGE_SIZE);
  }, [query, location.key]);

  const loadMore = async () => {
    const nextVisible = visibleLimit + CLIENTS_PAGE_SIZE;
    setVisibleLimit(nextVisible);
    if (!canFetchMoreRemote || remoteLoading) return;
    if (nextVisible <= allRows.length && localOwnedCount >= (remoteTotal ?? 0)) return;
    setRemoteLoading(true);
    try {
      const nextOffset = remoteOffset + CLIENTS_PAGE_SIZE;
      const { total } = await fetchProspectPage(nextOffset);
      setRemoteOffset(nextOffset);
      setRemoteTotal(total);
    } catch {
      /* keep local slice */
    } finally {
      setRemoteLoading(false);
    }
  };

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

        {workspaceLabel ? (
          <div className="clients-workspace-hint" style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
            Workspace: <strong>{workspaceLabel}</strong>
            {isSalaWorkspace ? " (sala)" : " (personal)"}
            {remoteLoading ? " · sincronizando…" : null}
          </div>
        ) : null}
        {listError ? (
          <div className="clients-list-error" style={{ color: "var(--danger, #c0392b)", fontSize: 13, marginBottom: 10 }}>
            No se pudo sincronizar con el servidor: {listError}
          </div>
        ) : null}

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
          <div className={`client-table-card${showTeamCols ? " client-table-card--team" : ""}`}>
            <table className="client-table">
              <thead>
                <tr>
                  <th>{t("clients.colName")}</th>
                  <th>{t("clients.colDate")}</th>
                  <th className="client-th-calif">{t("clients.colTourType")}</th>
                  {showTeamCols ? (
                    <>
                      <th className="client-th-team">{t("clients.colVendor")}</th>
                      <th className="client-th-team">{t("clients.colCloser")}</th>
                      <th className="client-th-team client-th-updated">{t("clients.colUpdated")}</th>
                    </>
                  ) : null}
                  <th style={{ textAlign: "center" }}>{t("clients.colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const nodes = [];
                  let prevYm = "";
                  let prevYear = null;
                  for (const c of visibleRows) {
                    const ymd = clientListYmd(c);
                    const ym = ymd.length >= 7 ? ymd.slice(0, 7) : "";
                    if (ym && ym !== prevYm) {
                      const year = Number(ym.slice(0, 4));
                      const monthIdx = Number(ym.slice(5, 7)) - 1;
                      const monthLabel = months[monthIdx] || ym;
                      if (prevYear == null ? year !== currentYear : year !== prevYear) {
                        nodes.push(
                          <tr key={`sep-y-${ym}`} className="client-period-sep client-period-sep--year" aria-hidden="true">
                            <td colSpan={tableColSpan}>{year}</td>
                          </tr>,
                        );
                      }
                      nodes.push(
                        <tr key={`sep-m-${ym}`} className="client-period-sep" aria-hidden="true">
                          <td colSpan={tableColSpan}>{monthLabel}</td>
                        </tr>,
                      );
                      prevYm = ym;
                      prevYear = year;
                    }
                    const href = c.pinned ? c.href : `/clients/${c.id}`;
                    const hasRecognizedSale = !c.pinned && isQuantifiableSaleClient(c);
                    const nameClass = hasRecognizedSale
                      ? "client-name-text client-name-text--sale"
                      : "client-name-text";
                    const teamActivity = c.team ? formatTeamActivity(c.team, t, lang) : null;
                    nodes.push(
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
                            {showTeamCols && c.team ? (
                              <span className="client-team-meta client-team-meta--mobile">
                                {c.team.vendedor} · {c.team.cerrador}
                                {teamActivity && teamActivity !== "—" ? ` · ${teamActivity}` : ""}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td>{c.tourDate ? shortDate(c.tourDate, lang) : c.createdYmd ? shortDate(c.createdYmd, lang) : "—"}</td>
                        <td className="client-td-calif">{formatQualification(c.tipo_tour)}</td>
                        {showTeamCols ? (
                          <>
                            <td className="client-td-team">{c.team?.vendedor || "—"}</td>
                            <td className="client-td-team">{c.team?.cerrador || t("clients.unassignedCloser")}</td>
                            <td className="client-td-team client-td-updated">{teamActivity || "—"}</td>
                          </>
                        ) : null}
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
                      </tr>,
                    );
                  }
                  return nodes;
                })()}
              </tbody>
            </table>
            {visibleLimit < allRows.length || canFetchMoreRemote ? (
              <div className="btn-row" style={{ padding: "12px 16px", justifyContent: "center" }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={remoteLoading}
                  onClick={() => { void loadMore(); }}
                >
                  {remoteLoading
                    ? t("common.loading")
                    : t("clients.loadMore", {
                      shown: visibleRows.length,
                      total: hasSearch ? allRows.length : totalCount,
                    })}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {canShare && (
        <ShareProspectModal
          open={!!shareClient}
          onOpenChange={(openModal) => { if (!openModal) setShareClient(null); }}
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
