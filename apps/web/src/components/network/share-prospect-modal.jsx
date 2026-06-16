
import { useEffect, useState } from "react";
import { SalesModal } from "@/components/ui/sales-modal";
import { networkApi, sharingApi } from "@/lib/network-api.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { toast } from "@/lib/toast";

function displayName(user) {
  return user?.full_name?.trim() || user?.email?.split("@")[0] || "Usuario";
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
      maxWidth={560}
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
                <option value="view">{t("network.permView")}</option>
                <option value="edit">{t("network.permEdit")}</option>
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
          <div className="network-list compact">
            {shares.map((s) => (
              <div key={s.id} className="network-row">
                <div className="network-row-main">
                  <div className="network-row-name">{displayName(s.shared_with)}</div>
                  <div className="network-row-sub">{s.permission === "edit" ? t("network.permEdit") : t("network.permView")}</div>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleRemove(s.id)}>
                  {t("network.revoke")}
                </button>
              </div>
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
