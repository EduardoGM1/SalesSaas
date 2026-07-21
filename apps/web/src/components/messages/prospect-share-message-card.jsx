import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Check, FolderOpen, KeyRound, X } from "lucide-react";
import { sharingApi } from "@/lib/network-api.js";
import { fetchProfile } from "@/lib/session-api.js";
import { toast } from "@/lib/toast";

const PERM_KEY = {
  view: "network.permView",
  edit: "network.permEdit",
  comment: "network.permComment",
  workspace: "network.permWorkspace",
};

function permLabel(t, permission) {
  return t(PERM_KEY[permission] || "network.permView");
}

function rank(permission) {
  if (permission === "workspace") return 3;
  if (permission === "edit") return 2;
  if (permission === "comment") return 1;
  return 0;
}

/**
 * Tarjeta de mensaje estructurado de share / permisos en el chat.
 */
export function ProspectShareMessageCard({ message, t, onResolved }) {
  const meta = message?.metadata || {};
  const type = message?.message_type || "text";
  const [busy, setBusy] = useState(false);
  const [myUserId, setMyUserId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchProfile().then((p) => {
      if (!cancelled && p?.id) setMyUserId(p.id);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const ownerId = meta.owner_id;
  const prospectId = meta.prospect_id;
  let shareId = meta.share_id;
  if (meta.group_share && Array.isArray(meta.shares) && myUserId) {
    const mine = meta.shares.find((s) => s.shared_with_id === myUserId);
    if (mine?.share_id) shareId = mine.share_id;
  }
  const requestId = meta.request_id;
  const permission = meta.permission;
  const requested = meta.requested_permission || "edit";
  const decision = meta.decision;

  const href = ownerId && prospectId
    ? `/red/contacto/${ownerId}/expediente/${prospectId}`
    : null;

  const canDecide = type === "permission_request"
    && !message.mine
    && requestId
    && !decision;

  const canRequestUpgrade = type === "access_granted"
    && !message.mine
    && shareId
    && permission
    && permission !== "workspace";

  const canRequestEdit = canRequestUpgrade && rank(permission) < rank("edit");
  const canRequestWorkspace = canRequestUpgrade && rank(permission) < rank("workspace");

  const handleDecide = async (value) => {
    if (!requestId || busy) return;
    setBusy(true);
    try {
      await sharingApi.decidePermission(requestId, value);
      toast.success(value === "approved" ? t("messages.share.approvedToast") : t("messages.share.rejectedToast"));
      onResolved?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRequest = async (toPermission) => {
    if (!shareId || busy) return;
    setBusy(true);
    try {
      await sharingApi.requestPermission(shareId, toPermission);
      toast.success(t("messages.share.requestSentToast"));
      onResolved?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  let title = t("messages.share.accessTitle");
  let Icon = FolderOpen;
  if (type === "permission_request") {
    title = t("messages.share.requestTitle");
    Icon = KeyRound;
  } else if (type === "permission_response") {
    title = decision === "approved"
      ? t("messages.share.responseApprovedTitle")
      : t("messages.share.responseRejectedTitle");
    Icon = decision === "approved" ? Check : X;
  }

  return (
    <div className={`msg-share-card msg-share-card--${type}`}>
      <div className="msg-share-card-head">
        <span className="msg-share-card-icon"><Icon size={16} /></span>
        <span className="msg-share-card-title">{title}</span>
      </div>
      <div className="msg-share-card-name">{meta.prospect_name || t("messages.share.fileFallback")}</div>
      {meta.prospect_code && (
        <div className="msg-share-card-code">{meta.prospect_code}</div>
      )}
      <div className="msg-share-card-perm">
        {type === "permission_request" ? (
          <>
            {permLabel(t, permission)} → <strong>{permLabel(t, requested)}</strong>
          </>
        ) : type === "permission_response" ? (
          decision === "approved"
            ? permLabel(t, meta.permission || requested)
            : t("messages.share.unchanged")
        ) : (
          permLabel(t, permission)
        )}
      </div>
      <div className="msg-share-card-actions">
        {href && (
          <Link to={href} className="btn btn-ghost btn-sm">{t("messages.share.open")}</Link>
        )}
        {canRequestEdit && (
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => handleRequest("edit")}>
            {t("messages.share.requestEdit")}
          </button>
        )}
        {canRequestWorkspace && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => handleRequest("workspace")}>
            {t("messages.share.requestWorkspace")}
          </button>
        )}
        {canDecide && (
          <>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => handleDecide("approved")}>
              {t("messages.share.approve")}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => handleDecide("rejected")}>
              {t("messages.share.reject")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function conversationPreview(message, t) {
  const type = message?.message_type || "text";
  if (type === "access_granted") return t("messages.share.previewAccess");
  if (type === "permission_request") return t("messages.share.previewRequest");
  if (type === "permission_response") {
    return message?.metadata?.decision === "approved"
      ? t("messages.share.previewApproved")
      : t("messages.share.previewRejected");
  }
  return message?.body || "";
}
