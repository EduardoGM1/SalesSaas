
import { useEffect, useState } from "react";
import { UserPlus, Check, X, MessageSquare } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { networkApi } from "@/lib/network-api.js";
import { RemoveContactModal } from "@/components/network/remove-contact-modal.jsx";
import { useI18n } from "@/hooks/use-i18n.js";
import { toast } from "@/lib/toast";

function displayName(user) {
  return user?.full_name?.trim() || user?.email?.split("@")[0] || "Usuario";
}

function UserAvatar({ user, label }) {
  const text = (label || displayName(user)).slice(0, 2).toUpperCase();
  if (user?.avatar_url) {
    return <img src={user.avatar_url} alt="" className="network-avatar-img" />;
  }
  return <div className="network-avatar">{text}</div>;
}

function ConnectionActions({ connection, onRefresh, onRequestRemove, t }) {
  const peer = connection.peer;
  const navigate = useNavigate();

  if (connection.status === "pending" && connection.direction === "incoming") {
    return (
      <div className="network-row-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={async (e) => {
          e.stopPropagation();
          try {
            await networkApi.updateConnection(connection.id, "accepted");
            toast.success(t("network.accepted"));
            onRefresh();
          } catch (err) {
            toast.error(err.message);
          }
        }}><Check size={14} /> {t("network.accept")}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={async (e) => {
          e.stopPropagation();
          try {
            await networkApi.removeConnection(connection.id);
            onRefresh();
          } catch (err) {
            toast.error(err.message);
          }
        }}><X size={14} /></button>
      </div>
    );
  }

  if (connection.status === "accepted") {
    return (
      <div className="network-row-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => {
          e.stopPropagation();
          navigate(`/messages?with=${peer.id}`);
        }}>
          <MessageSquare size={14} /> {t("network.message")}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => {
          e.stopPropagation();
          onRequestRemove(connection);
        }}>{t("network.remove")}</button>
      </div>
    );
  }

  if (connection.status === "pending" && connection.direction === "outgoing") {
    return <span className="network-pill pending">{t("network.pending")}</span>;
  }

  return null;
}

export function NetworkPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removePending, setRemovePending] = useState(false);

  const refresh = async () => {
    if (!isSupabaseConfigured()) return;
    try {
      const conn = await networkApi.listConnections();
      setConnections(conn);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const data = await networkApi.searchUsers(q);
        setResults(data);
      } catch (err) {
        toast.error(err.message);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const handleRemoveConfirm = async () => {
    if (!removeTarget) return;
    setRemovePending(true);
    try {
      await networkApi.removeConnection(removeTarget.id);
      toast.success(t("network.contactRemoved"));
      setRemoveTarget(null);
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRemovePending(false);
    }
  };

  if (!isSupabaseConfigured()) {
    return (
      <>
        <Topbar title={t("network.title")} subtitle={t("network.subtitle")} />
        <div className="sales-page">
          <PageBack />
          <div className="ethic-box">{t("network.cloudRequired")}</div>
        </div>
      </>
    );
  }

  const pending = connections.filter((c) => c.status === "pending");
  const contacts = connections.filter((c) => c.status === "accepted");

  return (
    <>
      <Topbar title={t("network.title")} subtitle={t("network.subtitle")} />
      <div className="sales-page">
        <PageBack />
        <div className="page-head">
          <div>
            <div className="page-title">{t("network.title")}</div>
            <div className="page-sub">{t("network.subtitle")}</div>
          </div>
        </div>

        <div className="network-search-card">
          <UserPlus size={18} className="network-search-icon" />
          <input
            type="search"
            className="network-search-input"
            placeholder={t("network.searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {searching && <span className="network-search-hint">{t("common.loading")}</span>}
        </div>

        {results.length > 0 && (
          <section className="network-section">
            <div className="section-label">{t("network.searchResults")}</div>
            <div className="network-list">
              {results.map((user) => (
                <div key={user.id} className="network-row">
                  <UserAvatar user={user} />
                  <div className="network-row-main">
                    <div className="network-row-name">{displayName(user)}</div>
                    <div className="network-row-sub">{user.email}</div>
                  </div>
                  {user.connection_status === "accepted" ? (
                    <span className="network-pill ok">{t("network.contact")}</span>
                  ) : user.connection_status === "pending" ? (
                    <span className="network-pill pending">{t("network.pending")}</span>
                  ) : (
                    <button type="button" className="btn btn-primary btn-sm" onClick={async () => {
                      try {
                        await networkApi.sendRequest(user.id);
                        toast.success(t("network.requestSent"));
                        refresh();
                      } catch (err) {
                        toast.error(err.message);
                      }
                    }}>{t("network.addContact")}</button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {!loading && pending.length > 0 && (
          <section className="network-section">
            <div className="section-label">{t("network.pendingRequests")}</div>
            <div className="network-list">
              {pending.map((c) => (
                <div key={c.id} className="network-row">
                  <UserAvatar user={c.peer} />
                  <div className="network-row-main">
                    <div className="network-row-name">{displayName(c.peer)}</div>
                    <div className="network-row-sub">{c.peer?.email}</div>
                  </div>
                  <ConnectionActions connection={c} onRefresh={refresh} onRequestRemove={setRemoveTarget} t={t} />
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="network-section">
          <div className="section-label">{t("network.myContacts")}</div>
          {contacts.length === 0 ? (
            <div className="dp-empty">{t("network.noContacts")}</div>
          ) : (
            <div className="network-list">
              {contacts.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="network-row network-row-clickable"
                  onClick={() => navigate(`/red/contacto/${c.peer.id}`)}
                >
                  <UserAvatar user={c.peer} />
                  <div className="network-row-main">
                    <div className="network-row-name">{displayName(c.peer)}</div>
                    <div className="network-row-sub">{c.peer?.email}</div>
                  </div>
                  <ConnectionActions connection={c} onRefresh={refresh} onRequestRemove={setRemoveTarget} t={t} />
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <RemoveContactModal
        open={!!removeTarget}
        onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}
        contact={removeTarget?.peer}
        pending={removePending}
        onConfirm={handleRemoveConfirm}
      />
    </>
  );
}
