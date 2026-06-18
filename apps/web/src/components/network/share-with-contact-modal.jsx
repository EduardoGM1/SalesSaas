
import { useEffect, useMemo, useState } from "react";
import { SalesModal } from "@/components/ui/sales-modal";
import { networkApi, sharingApi } from "@/lib/network-api.js";
import { clientDisplayName } from "@/lib/clients";
import { useI18n } from "@/hooks/use-i18n.js";
import { useDbStore } from "@/stores/db-store";
import { toast } from "@/lib/toast";
import { networkDisplayName } from "@/components/network/network-user-avatar.jsx";

const PERM_OPTIONS = [
  { value: "view", key: "network.permView" },
  { value: "edit", key: "network.permEdit" },
  { value: "comment", key: "network.permComment" },
];

function ContactShareRow({ share, onPermissionChange, onRemove, t }) {
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
      <div className="share-row-name">{share.prospect_name}</div>
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

export function ShareWithContactModal({ open, onOpenChange, contact }) {
  const { t } = useI18n();
  const clients = useDbStore((s) => s.db.clients);
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedProspectId, setSelectedProspectId] = useState("");
  const [permission, setPermission] = useState("view");

  const contactId = contact?.id;
  const contactName = contact ? networkDisplayName(contact) : "";

  const prospectOptions = useMemo(() => {
    return Object.values(clients || {})
      .map((client) => ({
        id: client.id,
        name: clientDisplayName(client),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [clients]);

  const refresh = async () => {
    if (!contactId) return;
    setLoading(true);
    try {
      const shareData = await networkApi.listSharesWithContact(contactId);
      setShares(shareData.sent ?? []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && contactId) refresh();
    else {
      setSelectedProspectId("");
      setPermission("view");
      setShares([]);
    }
  }, [open, contactId]);

  const sharedProspectIds = useMemo(
    () => new Set(shares.map((s) => s.prospect_id)),
    [shares],
  );

  const availableProspects = prospectOptions.filter((p) => !sharedProspectIds.has(p.id));

  const handleShare = async () => {
    if (!selectedProspectId || !contactId) return;
    try {
      await sharingApi.create(selectedProspectId, contactId, permission);
      toast.success(t("network.shareSuccess"));
      setSelectedProspectId("");
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
      sub={t("network.shareFromContactSub", { name: contactName })}
      maxWidth={600}
    >
      {loading ? (
        <div className="dp-empty">{t("common.loading")}</div>
      ) : prospectOptions.length === 0 ? (
        <div className="ethic-box">{t("network.shareNeedProspects")}</div>
      ) : availableProspects.length === 0 && shares.length === 0 ? (
        <div className="ethic-box">{t("network.shareAllSharedWithContact")}</div>
      ) : (
        <>
          {availableProspects.length > 0 && (
            <>
              <div className="prospect-grid" style={{ marginBottom: 12 }}>
                <div className="prospect-field full">
                  <label>{t("network.sharePickProspect")}</label>
                  <select value={selectedProspectId} onChange={(e) => setSelectedProspectId(e.target.value)}>
                    <option value="">{t("network.selectProspect")}</option>
                    {availableProspects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
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
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={!selectedProspectId}
                  onClick={handleShare}
                >
                  {t("network.shareAction")}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {shares.length > 0 && (
        <>
          <div className="section-label">{t("network.currentSharesWithContact")}</div>
          <div className="share-list">
            {shares.map((s) => (
              <ContactShareRow
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
