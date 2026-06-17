import { useEffect, useState } from "react";
import {
  getPushStatus,
  isPushSupported,
  needsIosPwaInstall,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push-notifications.js";
import { openInstallPrompt } from "@/lib/pwa-install.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { toast } from "@/lib/toast";

export function NotificationsSettings({
  settings,
  onNotificationsChange,
  onSave,
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState({
    supported: false,
    subscribed: false,
    permission: "default",
    pushConfigured: true,
    needsIosPwa: false,
    needsResync: false,
  });
  const [pending, setPending] = useState(false);

  const notifications = settings?.notifications ?? {
    messages: true,
    connection_requests: true,
    connection_accepted: true,
  };

  const refreshStatus = () => {
    getPushStatus().then(setStatus).catch(() => {});
  };

  useEffect(() => {
    refreshStatus();
  }, []);

  const setPref = (key, value) => {
    onNotificationsChange({
      ...notifications,
      [key]: value,
    });
  };

  const handleEnable = async () => {
    if (needsIosPwaInstall()) {
      toast.error(t("settings.notifications.iosPwaRequired"));
      openInstallPrompt();
      return;
    }

    if (status.permission === "denied") {
      toast.error(t("settings.notifications.deniedHelp"));
      return;
    }

    setPending(true);
    try {
      await subscribeToPush();
      refreshStatus();
      toast.success(t("settings.notifications.enabled"));
      await onSave?.();
    } catch (err) {
      if (err?.code === "PERMISSION_DENIED") {
        refreshStatus();
        toast.error(t("settings.notifications.deniedHelp"));
      } else if (err?.code === "PERMISSION_DISMISSED") {
        toast.error(t("settings.notifications.dismissed"));
      } else if (err?.code === "IOS_PWA_REQUIRED") {
        toast.error(t("settings.notifications.iosPwaRequired"));
        openInstallPrompt();
      } else if (err?.code === "ONESIGNAL_NOT_CONFIGURED") {
        refreshStatus();
        toast.error(t("settings.notifications.serverNotConfigured"));
      } else if (err?.code === "PUSH_SERVICE_ERROR") {
        toast.error(t("settings.notifications.pushServiceError"));
      } else {
        toast.error(err instanceof Error ? err.message : t("settings.notifications.error"));
      }
    } finally {
      setPending(false);
    }
  };

  const handleDisable = async () => {
    setPending(true);
    try {
      await unsubscribeFromPush();
      refreshStatus();
      toast.success(t("settings.notifications.disabled"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.notifications.error"));
    } finally {
      setPending(false);
    }
  };

  if (needsIosPwaInstall()) {
    return (
      <div className="ethic-box">
        <p style={{ marginBottom: 12 }}>{t("settings.notifications.iosPwaRequired")}</p>
        <button type="button" className="btn btn-primary btn-sm" onClick={openInstallPrompt}>
          {t("settings.notifications.iosPwaInstall")}
        </button>
      </div>
    );
  }

  if (!isPushSupported()) {
    return (
      <div className="ethic-box">{t("settings.notifications.unsupported")}</div>
    );
  }

  return (
    <>
      {!status.pushConfigured && (
        <div className="auth-error" style={{ marginBottom: 12 }}>
          {t("settings.notifications.serverNotConfigured")}
        </div>
      )}

      {status.needsResync && (
        <div className="auth-error" style={{ marginBottom: 12 }}>
          {t("settings.notifications.needsResync")}
        </div>
      )}

      <div className="settings-row">
        <div>
          <div className="settings-label">{t("settings.notifications.status")}</div>
          <div className="settings-help">
            {status.subscribed
              ? t("settings.notifications.statusOn")
              : t("settings.notifications.statusOff")}
            {status.permission === "denied" ? ` — ${t("settings.notifications.denied")}` : ""}
          </div>
        </div>
        <div className="btn-row">
          {!status.subscribed ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending || !status.pushConfigured}
              onClick={handleEnable}
            >
              {pending ? t("common.loading") : t("settings.notifications.enable")}
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" disabled={pending} onClick={handleDisable}>
              {pending ? t("common.loading") : t("settings.notifications.disable")}
            </button>
          )}
        </div>
      </div>

      {status.permission === "denied" && (
        <p className="settings-help" style={{ marginBottom: 12 }}>
          {t("settings.notifications.deniedHelp")}
        </p>
      )}

      <div className="settings-row">
        <div>
          <div className="settings-label">{t("settings.notifications.prefsTitle")}</div>
          <div className="settings-help">{t("settings.notifications.prefsHelp")}</div>
        </div>
        <div className="settings-checklist">
          <label className="settings-check">
            <input
              type="checkbox"
              checked={notifications.messages !== false}
              onChange={(e) => setPref("messages", e.target.checked)}
            />
            {t("settings.notifications.prefMessages")}
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={notifications.connection_requests !== false}
              onChange={(e) => setPref("connection_requests", e.target.checked)}
            />
            {t("settings.notifications.prefRequests")}
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={notifications.connection_accepted !== false}
              onChange={(e) => setPref("connection_accepted", e.target.checked)}
            />
            {t("settings.notifications.prefAccepted")}
          </label>
        </div>
      </div>

      <p className="settings-help" style={{ marginTop: 8 }}>
        {t("settings.notifications.pwaHint")}
      </p>
    </>
  );
}
