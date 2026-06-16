
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MessageSquare, FolderOpen } from "lucide-react";
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

function UserAvatar({ user }) {
  const text = displayName(user).slice(0, 2).toUpperCase();
  if (user?.avatar_url) {
    return <img src={user.avatar_url} alt="" className="network-avatar-img" />;
  }
  return <div className="network-avatar">{text}</div>;
}

function permLabel(perm, t) {
  if (perm === "edit") return t("network.permEdit");
  if (perm === "comment") return t("network.permComment");
  return t("network.permView");
}

function ShareList({ items, contactId, t, empty }) {
  if (!items.length) return <div className="dp-empty">{empty}</div>;
  return (
    <div className="network-list">
      {items.map((s) => (
        <div key={s.id} className="network-row">
          <FolderOpen size={20} className="network-folder-icon" />
          <div className="network-row-main">
            <div className="network-row-name">{s.prospect_name}</div>
            <div className="network-row-sub">{permLabel(s.permission, t)}</div>
          </div>
          <Link
            to={`/red/contacto/${contactId}/expediente/${s.prospect_id}`}
            className="btn btn-ghost btn-sm"
          >
            {t("network.openShared")}
          </Link>
        </div>
      ))}
    </div>
  );
}

export function ContactPage({ contactId }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [connection, setConnection] = useState(null);
  const [shares, setShares] = useState({ received: [], sent: [] });
  const [tab, setTab] = useState("received");
  const [loading, setLoading] = useState(true);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removePending, setRemovePending] = useState(false);

  const refresh = async () => {
    if (!isSupabaseConfigured()) return;
    try {
      const [conn, shareData] = await Promise.all([
        networkApi.getContact(contactId),
        networkApi.listSharesWithContact(contactId),
      ]);
      setConnection(conn);
      setShares(shareData);
    } catch (err) {
      toast.error(err.message);
      navigate("/network");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [contactId]);

  const handleRemove = async () => {
    if (!connection) return;
    setRemovePending(true);
    try {
      await networkApi.removeConnection(connection.id);
      toast.success(t("network.contactRemoved"));
      navigate("/network");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRemovePending(false);
      setRemoveOpen(false);
    }
  };

  if (!isSupabaseConfigured()) {
    return (
      <>
        <Topbar title={t("network.contactTitle")} subtitle="" />
        <div className="sales-page">
          <PageBack href="/network" />
          <div className="ethic-box">{t("network.cloudRequired")}</div>
        </div>
      </>
    );
  }

  const peer = connection?.peer;

  return (
    <>
      <Topbar title={t("network.contactTitle")} subtitle={peer ? displayName(peer) : ""} />
      <div className="sales-page">
        <PageBack href="/network" />

        {loading ? (
          <div className="dp-empty">{t("common.loading")}</div>
        ) : peer ? (
          <>
            <header className="contact-page-head">
              <UserAvatar user={peer} />
              <div className="contact-page-meta">
                <h1 className="exp-page-title">{displayName(peer)}</h1>
                <p className="exp-page-sub">{peer.email}</p>
              </div>
              <div className="contact-page-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(`/messages?with=${peer.id}`)}>
                  <MessageSquare size={14} /> {t("network.message")}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRemoveOpen(true)}>
                  {t("network.remove")}
                </button>
              </div>
            </header>

            <div className="seg contact-tabs">
              <button type="button" className={`seg-btn${tab === "received" ? " on" : ""}`} onClick={() => setTab("received")}>
                {t("network.tabReceived")}
              </button>
              <button type="button" className={`seg-btn${tab === "sent" ? " on" : ""}`} onClick={() => setTab("sent")}>
                {t("network.tabSent")}
              </button>
            </div>

            <section className="network-section">
              {tab === "received" ? (
                <ShareList
                  items={shares.received}
                  contactId={contactId}
                  t={t}
                  empty={t("network.noSharedFromContact")}
                />
              ) : (
                <ShareList
                  items={shares.sent}
                  contactId={contactId}
                  t={t}
                  empty={t("network.noSharedToContact")}
                />
              )}
            </section>
          </>
        ) : null}
      </div>

      <RemoveContactModal
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        contact={peer}
        pending={removePending}
        onConfirm={handleRemove}
      />
    </>
  );
}
