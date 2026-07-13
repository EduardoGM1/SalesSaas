import { useEffect, useMemo, useState } from "react";
import { Eye, FolderPlus, Pencil } from "lucide-react";
import { SalesModal } from "@/components/ui/sales-modal";
import { networkApi, sharingApi } from "@/lib/network-api.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { toast } from "@/lib/toast";
import { nudgePushPrompt } from "@/lib/push-prompt.js";
import { fetchProfile } from "@/lib/session-api.js";
import { buildMailtoHref } from "@/lib/share-message-templates.js";
import {
  buildExternalShareMessage,
  canUseWebShare,
  shareExternally,
} from "@/lib/share-external.js";

const LEVELS = [
  { value: "view", icon: Eye, key: "network.shareLevel.view", recommended: false },
  { value: "edit", icon: Pencil, key: "network.shareLevel.edit", recommended: true },
  { value: "workspace", icon: FolderPlus, key: "network.shareLevel.workspace", recommended: false },
];

const PERM_OPTIONS = [
  { value: "view", key: "network.permView" },
  { value: "edit", key: "network.permEdit" },
  { value: "workspace", key: "network.permWorkspace" },
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
        value={share.permission === "comment" ? "view" : share.permission}
        onChange={(e) => handlePerm(e.target.value)}
        aria-label={t("network.permission")}
      >
        {PERM_OPTIONS.filter((o) => o.value !== "comment").map(({ value, key }) => (
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

export function ShareProspectModal({ open, onOpenChange, prospectId, prospectName, prospect }) {
  const { t, lang } = useI18n();
  const [mode, setMode] = useState("internal");
  const [contacts, setContacts] = useState([]);
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [permission, setPermission] = useState("edit");
  const [externalPermission, setExternalPermission] = useState("edit");
  const [invitePayload, setInvitePayload] = useState(null);
  const [sharingOut, setSharingOut] = useState(false);
  const [sharerName, setSharerName] = useState("Saletse");

  const clientForShare = useMemo(() => {
    if (prospect && typeof prospect === "object") {
      return { ...prospect, id: prospect.id || prospectId };
    }
    return { id: prospectId, name: prospectName, name1: prospectName };
  }, [prospect, prospectId, prospectName]);

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
    if (open) {
      setMode("internal");
      setPermission("edit");
      setExternalPermission("edit");
      refresh();
      fetchProfile().then((p) => {
        if (p?.full_name) setSharerName(p.full_name.trim());
        else if (p?.email) setSharerName(p.email.split("@")[0]);
      }).catch(() => {});
    } else {
      setSelectedId("");
      setInvitePayload(null);
      setMode("internal");
    }
  }, [open, prospectId]);

  useEffect(() => {
    if (!open || mode !== "external" || !prospectId || typeof window === "undefined") {
      setInvitePayload(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const invite = await sharingApi.createInvite(prospectId, externalPermission);
        if (cancelled) return;
        const msg = buildExternalShareMessage({
          client: clientForShare,
          origin: window.location.origin,
          lang,
          inviteToken: invite.token,
          sharerName,
        });
        setInvitePayload({ ...msg, token: invite.token });
      } catch (err) {
        if (!cancelled) {
          setInvitePayload(null);
          toast.error(err.message);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open, mode, prospectId, externalPermission, clientForShare, lang, sharerName]);

  const handleShare = async () => {
    if (!selectedId) return;
    try {
      await sharingApi.create(prospectId, selectedId, permission);
      toast.success(t("network.shareSuccess"));
      setSelectedId("");
      refresh();
      nudgePushPrompt({ contextual: true, reason: "prospect-shared" });
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

  const handleCopyLink = async () => {
    if (!invitePayload?.url) return;
    try {
      await navigator.clipboard.writeText(invitePayload.url);
      toast.success(t("network.shareExternal.copied"));
    } catch {
      toast.error(t("auth.login.errorGeneric"));
    }
  };

  const handleExternalShare = async () => {
    if (!invitePayload?.text) return;
    setSharingOut(true);
    try {
      const result = await shareExternally({
        text: invitePayload.text,
        title: invitePayload.subject,
      });
      if (result === "shared" || result === "whatsapp") {
        toast.success(t("network.shareExternal.done"));
      }
    } catch (err) {
      toast.error(err?.message || t("auth.login.errorGeneric"));
    } finally {
      setSharingOut(false);
    }
  };

  return (
    <SalesModal
      open={open}
      onOpenChange={onOpenChange}
      title={t("network.shareTitle")}
      sub={t("network.shareSub", { name: prospectName })}
      maxWidth={640}
    >
      <div className="share-mode-tabs" role="tablist" aria-label={t("network.shareTitle")}>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "internal"}
          className={`share-mode-tab${mode === "internal" ? " on" : ""}`}
          onClick={() => setMode("internal")}
        >
          {t("network.shareModeInternal")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "external"}
          className={`share-mode-tab${mode === "external" ? " on" : ""}`}
          onClick={() => setMode("external")}
        >
          {t("network.shareModeExternal")}
        </button>
      </div>

      {mode === "external" ? (
        <div className="share-external-panel">
          <div className="share-level-grid">
            {LEVELS.map((lvl) => {
              const Icon = lvl.icon;
              const on = externalPermission === lvl.value;
              return (
                <button
                  key={lvl.value}
                  type="button"
                  className={`share-level-card${on ? " on" : ""}`}
                  onClick={() => setExternalPermission(lvl.value)}
                >
                  {lvl.recommended && <span className="share-level-badge">{t("network.shareLevel.recommended")}</span>}
                  <Icon size={20} aria-hidden />
                  <strong>{t(`${lvl.key}.title`)}</strong>
                  <span>{t(`${lvl.key}.desc`)}</span>
                </button>
              );
            })}
          </div>
          <div className="section-label">{t("network.shareExternal.preview")}</div>
          <pre className="share-external-preview">{invitePayload?.text || t("common.loading")}</pre>
          <p className="share-external-hint">{t("network.shareExternal.hint")}</p>
          <div className="btn-row" style={{ marginTop: 0, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!invitePayload?.url} onClick={handleCopyLink}>
              {t("network.shareExternal.copyLink")}
            </button>
            <a
              className={`btn btn-ghost btn-sm${!invitePayload ? " disabled" : ""}`}
              href={invitePayload ? buildMailtoHref(invitePayload) : undefined}
              onClick={(e) => { if (!invitePayload) e.preventDefault(); }}
            >
              {t("network.shareExternal.email")}
            </a>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!invitePayload || sharingOut}
              onClick={handleExternalShare}
            >
              {sharingOut
                ? t("common.loading")
                : canUseWebShare()
                  ? t("network.shareExternal.action")
                  : t("network.shareExternal.actionWhatsApp")}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="share-level-grid" style={{ marginBottom: 14 }}>
            {LEVELS.map((lvl) => {
              const Icon = lvl.icon;
              const on = permission === lvl.value;
              return (
                <button
                  key={lvl.value}
                  type="button"
                  className={`share-level-card${on ? " on" : ""}`}
                  onClick={() => setPermission(lvl.value)}
                >
                  {lvl.recommended && <span className="share-level-badge">{t("network.shareLevel.recommended")}</span>}
                  <Icon size={18} aria-hidden />
                  <strong>{t(`${lvl.key}.title`)}</strong>
                  <span>{t(`${lvl.key}.desc`)}</span>
                </button>
              );
            })}
          </div>

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
        </>
      )}
    </SalesModal>
  );
}
