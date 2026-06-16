
import { useEffect, useState } from "react";
import { SalesModal } from "@/components/ui/sales-modal";
import { networkApi, sharingApi } from "@/lib/network-api.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { toast } from "@/lib/toast";

const PERM_OPTIONS = [
  { value: "view", key: "network.permView" },
  { value: "edit", key: "network.permEdit" },
  { value: "comment", key: "network.permComment" },
];

function displayName(user) {
  return user?.full_name?.trim() || user?.email?.split("@")[0] || "Usuario";
}

function UserAvatar({ user }) {
  const text = displayName(user).slice(0, 2).toUpperCase();
  if (user?.avatar_url) {
    return <img src={user.avatar_url} alt="" className="network-avatar-img network-avatar-sm" />;
  }
  return <div className="network-avatar network-avatar-sm">{text}</div>;
}

function ShareRow({ share, onPermissionChange, onRemove, t }) {
  const [saved, setSaved] = useState(false);

  const handlePerm = async (permission) => {
    if (permission === share.permission) return;
    try {
      await onPermissionChange(share.id, permission);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="share-row">
      <UserAvatar user={share.shared_with} />
      <div className="share-row-name">{displayName(share.shared_with)}</div>
      <select
        className="share-perm-select"
        value={share.permission}
        onChange={(e) => handlePerm(e.target.value)}
        aria-label={t("network.permission")}
      >
        {PERM_OPTIONS.map(({ value, key }) => (
          <option key={value} value={value}>{t(key)}</option>
        ))}
      </select>
      {saved && <span className="share-perm-saved">{t("network.permUpdated")}</span>}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRemove(share.id)}>
        {t("network.revoke")}
      </button>
    </div>
  );
}

export function ShareProspectModal({ open, onOpenChange, prospectId, prospectName }) {
  const { t } = useI18n();
  const [contacts, setContacts] = useState([]);
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [permission, setPermission] = useState("view");

  const refresh = async () => {
    if (!prospectId) return;
    setLoading(true);
    try {
      const [conn, existing] = await Promise.all([
        networkApi.listConnections("accepted"),
        sharingApi.listForProspect(prospectId),
      ]);
      setContacts(conn.map((c) => c.peer).filter(Boolean));
      setShares(existing);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) refresh();
    else {
      setSelectedId("");
      setPermission("view");
    }
  }, [open, prospectId]);

  const handleShare = async () => {
    if (!selectedId) return;
    try {
      await sharingApi.create(prospectId, selectedId, permission);
      toast.success(t("network.shareSuccess"));
      setSelectedId("");
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handlePermissionChange = async (shareId, perm) => {
    await sharingApi.updatePermission(shareId, perm);
    await refresh();
  };

  const handleRemove = async (shareId) => {
    try {
      await sharingApi.remove(shareId);
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <SalesModal
      open={open}
      onOpenChange={onOpenChange}
      title={t("network.shareTitle")}
      sub={t("network.shareSub", { name: prospectName })}
      maxWidth={600}
    >
      {loading ? (
        <div className="dp-empty">{t("common.loading")}</div>
      ) : contacts.length === 0 ? (
        <div className="ethic-box">{t("network.shareNeedContacts")}</div>
      ) : (
        <>
          <div className="prospect-grid" style={{ marginBottom: 12 }}>
            <div className="prospect-field full">
              <label>{t("network.shareWith")}</label>
              <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                <option value="">{t("network.selectContact")}</option>
                {contacts
                  .filter((c) => !shares.some((s) => s.shared_with_id === c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>{displayName(c)}</option>
                  ))}
              </select>
            </div>
            <div className="prospect-field">
              <label>{t("network.permission")}</label>
              <select value={permission} onChange={(e) => setPermission(e.target.value)}>
                {PERM_OPTIONS.map(({ value, key }) => (
                  <option key={value} value={value}>{t(key)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="btn-row" style={{ marginTop: 0, marginBottom: 16 }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={!selectedId} onClick={handleShare}>
              {t("network.shareAction")}
            </button>
          </div>
        </>
      )}

      {shares.length > 0 && (
        <>
          <div className="section-label">{t("network.currentShares")}</div>
          <div className="share-list">
            {shares.map((s) => (
              <ShareRow
                key={s.id}
                share={s}
                t={t}
                onPermissionChange={handlePermissionChange}
                onRemove={handleRemove}
              />
            ))}
          </div>
        </>
      )}

      <div className="btn-row">
        <button type="button" className="btn btn-ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</button>
      </div>
    </SalesModal>
  );
}
