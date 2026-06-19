
import { useEffect, useState } from "react";
import { UserPlus, Check, X, MessageSquare, UserMinus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { networkApi } from "@/lib/network-api.js";
import { RemoveContactModal } from "@/components/network/remove-contact-modal.jsx";
import { NetworkUserAvatar, networkDisplayName } from "@/components/network/network-user-avatar.jsx";
import { usePresenceContext } from "@/components/providers/presence-provider.jsx";
import { useI18n } from "@/hooks/use-i18n.js";
import { toast } from "@/lib/toast";
import { nudgePushPrompt } from "@/lib/push-prompt.js";

function NetworkIconButton({ icon: Icon, label, onClick, variant = "default" }) {
  return (
    <button
      type="button"
      className={`network-icon-btn${variant === "danger" ? " network-icon-btn--danger" : ""}${variant === "primary" ? " network-icon-btn--primary" : ""}`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}

function ConnectionActions({ connection, onRefresh, onRequestRemove, t }) {
  const peer = connection.peer;
  const navigate = useNavigate();

  if (connection.status === "pending" && connection.direction === "incoming") {
    return (
      <div className="network-row-actions">
        <NetworkIconButton
          icon={Check}
          label={t("network.accept")}
          variant="primary"
          onClick={async (e) => {
            e.stopPropagation();
            try {
              await networkApi.updateConnection(connection.id, "accepted");
              toast.success(t("network.accepted"));
              onRefresh();
              nudgePushPrompt({ contextual: true, reason: "contact-accepted" });
            } catch (err) {
              toast.error(err.message);
            }
          }}
        />
        <NetworkIconButton
          icon={X}
          label={t("network.reject")}
          variant="danger"
          onClick={async (e) => {
            e.stopPropagation();
            try {
              await networkApi.removeConnection(connection.id);
              onRefresh();
            } catch (err) {
              toast.error(err.message);
            }
          }}
        />
      </div>
    );
  }

  if (connection.status === "accepted") {
    return (
      <div className="network-row-actions">
        <NetworkIconButton
          icon={MessageSquare}
          label={t("network.message")}
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/messages?with=${peer.id}`);
          }}
        />
        <NetworkIconButton
          icon={UserMinus}
          label={t("network.remove")}
          variant="danger"
          onClick={(e) => {
            e.stopPropagation();
            onRequestRemove(connection);
          }}
        />
      </div>
    );
  }

  if (connection.status === "pending" && connection.direction === "outgoing") {
    return (
      <div className="network-row-actions">
        <span className="network-pill pending">{t("network.pending")}</span>
        <NetworkIconButton
          icon={X}
          label={t("network.cancelRequest")}
          variant="danger"
          onClick={async (e) => {
            e.stopPropagation();
            try {
              await networkApi.removeConnection(connection.id);
              toast.success(t("network.requestCanceled"));
              onRefresh();
            } catch (err) {
              toast.error(err.message);
            }
          }}
        />
      </div>
    );
  }

  return null;
}

function SearchResultActions({ user, connections, onRefresh, t }) {
  const connection = connections.find(
    (c) => c.peer?.id === user.id && c.status === "pending",
  );

  if (user.connection_status === "accepted") {
    return <span className="network-pill ok">{t("network.contact")}</span>;
  }

  if (user.connection_status === "pending" && user.connection_direction === "outgoing" && connection) {
    return (
      <div className="network-row-actions">
        <span className="network-pill pending">{t("network.pending")}</span>
        <NetworkIconButton
          icon={X}
          label={t("network.cancelRequest")}
          variant="danger"
          onClick={async () => {
            try {
              await networkApi.removeConnection(connection.id);
              toast.success(t("network.requestCanceled"));
              onRefresh();
            } catch (err) {
              toast.error(err.message);
            }
          }}
        />
      </div>
    );
  }

  if (user.connection_status === "pending") {
    return <span className="network-pill pending">{t("network.pending")}</span>;
  }

  return (
    <button type="button" className="btn btn-primary btn-sm" onClick={async () => {
      try {
        await networkApi.sendRequest(user.id);
        toast.success(t("network.requestSent"));
        onRefresh();
      } catch (err) {
        toast.error(err.message);
      }
    }}>{t("network.addContact")}</button>
  );
}

export function NetworkPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { seedLastSeen } = usePresenceContext();
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
      const peers = conn.filter((c) => c.status === "accepted").map((c) => c.peer).filter(Boolean);
      seedLastSeen(peers);
      window.dispatchEvent(new Event("network:contacts-changed"));
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
                  <NetworkUserAvatar user={user} />
                  <div className="network-row-main">
                    <div className="network-row-name">{networkDisplayName(user)}</div>
                  </div>
                  <SearchResultActions user={user} connections={connections} onRefresh={refresh} t={t} />
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
                  <NetworkUserAvatar user={c.peer} />
                  <div className="network-row-main">
                    <div className="network-row-name">{networkDisplayName(c.peer)}</div>
                    {c.direction === "outgoing" && (
                      <div className="network-row-sub">{t("network.pending")}</div>
                    )}
                  </div>
                  <ConnectionActions
                    connection={c}
                    onRefresh={refresh}
                    onRequestRemove={setRemoveTarget}
                    t={t}
                  />
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
                  <NetworkUserAvatar user={c.peer} showPresence />
                  <div className="network-row-main">
                    <div className="network-row-name">{networkDisplayName(c.peer)}</div>
                  </div>
                  <ConnectionActions
                    connection={c}
                    onRefresh={refresh}
                    onRequestRemove={setRemoveTarget}
                    t={t}
                  />
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
