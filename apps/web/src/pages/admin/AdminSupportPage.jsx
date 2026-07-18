import { useCallback, useEffect, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { useI18n } from "@/hooks/use-i18n.js";
import { longDate } from "@/lib/format/dates";
import { PageBack } from "@/components/layout/page-back";
import { hasPermission } from "@/lib/auth/permissions";

const STATUS_OPTIONS = [
  { id: "all", labelKey: "admin.support.filterAll" },
  { id: "open", labelKey: "admin.support.statusOpen" },
  { id: "in_progress", labelKey: "admin.support.statusProgress" },
  { id: "resolved", labelKey: "admin.support.statusResolved" },
  { id: "closed", labelKey: "admin.support.statusClosed" },
];

async function fetchSupport(status) {
  const qs = status && status !== "all" ? `?status=${encodeURIComponent(status)}` : "";
  const res = await fetch(`/api/v1/admin/support/requests${qs}`, { credentials: "include" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Error al cargar tickets.");
  return body.data ?? body;
}

async function patchStatus(id, status) {
  const res = await fetch(`/api/v1/admin/support/requests/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "No se pudo actualizar.");
  return body.data ?? body;
}

async function fetchReplies(id) {
  const res = await fetch(`/api/v1/admin/support/requests/${id}/replies`, { credentials: "include" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Error al cargar respuestas.");
  return Array.isArray(body.data) ? body.data : [];
}

async function postReply(id, cuerpo) {
  const res = await fetch(`/api/v1/admin/support/requests/${id}/replies`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cuerpo }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "No se pudo enviar la respuesta.");
  return body.data ?? body;
}

export function AdminSupportPage() {
  const { t, lang } = useI18n();
  const session = useOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get("ticket");
  const [status, setStatus] = useState(highlightId ? "all" : "open");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingId, setPendingId] = useState(null);
  const [repliesByTicket, setRepliesByTicket] = useState({});
  const [replyDraft, setReplyDraft] = useState({});
  const [replyBusy, setReplyBusy] = useState(null);

  const canReply = hasPermission(session?.profile, "responder_tickets_soporte")
    || hasPermission(session?.profile, "support:read");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSupport(status);
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.support.loadError"));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [status, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!highlightId || loading) return;
    const el = document.getElementById(`ticket-${highlightId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    fetchReplies(highlightId)
      .then((list) => setRepliesByTicket((prev) => ({ ...prev, [highlightId]: list })))
      .catch(() => {});
  }, [highlightId, loading, items]);

  const onStatusChange = async (id, next) => {
    setPendingId(id);
    try {
      await patchStatus(id, next);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.support.updateError"));
    } finally {
      setPendingId(null);
    }
  };

  const loadReplies = async (id) => {
    try {
      const list = await fetchReplies(id);
      setRepliesByTicket((prev) => ({ ...prev, [id]: list }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.support.loadError"));
    }
  };

  const onReply = async (id) => {
    const cuerpo = String(replyDraft[id] || "").trim();
    if (!cuerpo) return;
    setReplyBusy(id);
    try {
      await postReply(id, cuerpo);
      setReplyDraft((prev) => ({ ...prev, [id]: "" }));
      await loadReplies(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.support.replyError"));
    } finally {
      setReplyBusy(null);
    }
  };

  return (
    <div className="sales-page admin-support-page">
      <div className="page-toolbar page-toolbar--between">
        <PageBack inline fallback="/admin" />
        <div className="admin-support-filters">
          <label className="admin-support-filter-label" htmlFor="support-status-filter">
            {t("admin.support.filter")}
          </label>
          <select
            id="support-status-filter"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>{t(opt.labelKey)}</option>
            ))}
          </select>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>
            {t("admin.support.refresh")}
          </button>
        </div>
      </div>

      <div className="admin-support-head">
        <h1 className="admin-support-title">{t("admin.support.title")}</h1>
        <p className="admin-support-sub">{t("admin.support.sub")}</p>
      </div>

      {error && <div className="auth-error" style={{ marginBottom: 12 }}>{error}</div>}
      {loading ? (
        <div className="admin-embedded-loading">{t("common.loading")}</div>
      ) : !items.length ? (
        <div className="client-empty">{t("admin.support.empty")}</div>
      ) : (
        <div className="admin-support-list">
          {items.map((ticket) => {
            const active = highlightId === ticket.id;
            const replies = repliesByTicket[ticket.id] || [];
            return (
              <article
                key={ticket.id}
                id={`ticket-${ticket.id}`}
                className={`admin-support-card${active ? " is-highlight" : ""}`}
              >
                <header className="admin-support-card-head">
                  <div>
                    <div className="admin-support-card-title">{ticket.request_type_label}</div>
                    <div className="admin-support-card-meta">
                      {ticket.app_area_label}
                      {" · "}
                      {ticket.platform}
                      {" · "}
                      {longDate(ticket.created_at, lang)}
                    </div>
                    <div className="admin-support-card-user">
                      {ticket.user?.name}
                      {ticket.user?.email ? ` · ${ticket.user.email}` : ""}
                    </div>
                  </div>
                  <select
                    className="admin-support-status"
                    value={ticket.status}
                    disabled={pendingId === ticket.id}
                    onChange={(e) => void onStatusChange(ticket.id, e.target.value)}
                    aria-label={t("admin.support.status")}
                  >
                    {STATUS_OPTIONS.filter((o) => o.id !== "all").map((opt) => (
                      <option key={opt.id} value={opt.id}>{t(opt.labelKey)}</option>
                    ))}
                  </select>
                </header>
                <p className="admin-support-desc">{ticket.description}</p>
                {ticket.screenshot_url ? (
                  <a
                    className="admin-support-shot"
                    href={ticket.screenshot_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img src={ticket.screenshot_url} alt={t("admin.support.screenshotAlt")} />
                  </a>
                ) : ticket.screenshot_purged ? (
                  <p className="admin-support-purged">{t("admin.support.purged")}</p>
                ) : ticket.screenshot_available ? (
                  <p className="admin-support-purged">{t("admin.support.shotUnavailable")}</p>
                ) : null}

                <div style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => void loadReplies(ticket.id)}
                  >
                    {t("admin.support.showReplies")} ({replies.length})
                  </button>
                  {replies.length > 0 && (
                    <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                      {replies.map((r) => (
                        <li key={r.id} style={{ marginBottom: 8 }}>
                          <div className="admin-cell-muted" style={{ fontSize: 12 }}>
                            {r.created_at ? longDate(String(r.created_at).slice(0, 10), lang) : ""}
                          </div>
                          <div>{r.cuerpo}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {canReply && (
                  <div style={{ marginTop: 12 }}>
                    <label className="admin-support-filter-label" htmlFor={`reply-${ticket.id}`}>
                      {t("admin.support.replyLabel")}
                    </label>
                    <textarea
                      id={`reply-${ticket.id}`}
                      className="auth-input"
                      rows={3}
                      style={{ width: "100%", marginTop: 6 }}
                      value={replyDraft[ticket.id] || ""}
                      onChange={(e) => setReplyDraft((prev) => ({ ...prev, [ticket.id]: e.target.value }))}
                      placeholder={t("admin.support.replyPlaceholder")}
                    />
                    <div className="btn-row" style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={replyBusy === ticket.id || !String(replyDraft[ticket.id] || "").trim()}
                        onClick={() => void onReply(ticket.id)}
                      >
                        {replyBusy === ticket.id ? t("admin.users.confirm.saving") : t("admin.support.replySend")}
                      </button>
                    </div>
                  </div>
                )}

                {active && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const next = new URLSearchParams(searchParams);
                      next.delete("ticket");
                      setSearchParams(next);
                    }}
                  >
                    {t("admin.support.clearHighlight")}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
