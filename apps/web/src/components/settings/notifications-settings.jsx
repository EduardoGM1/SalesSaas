import { useEffect, useState } from "react";
import {
  MessageSquare,
  UserPlus,
  CheckCircle2,
  FolderOpen,
  CalendarClock,
  CircleDollarSign,
  StickyNote,
  Bell,
  BellOff,
} from "lucide-react";
import {
  getPushStatus,
  isPushSupported,
  needsIosPwaInstall,
  unsubscribeFromPush,
} from "@/lib/push-notifications.js";
import { enablePushNotifications, toastPushEnableResult } from "@/lib/push-enable.js";
import { openInstallPrompt, isAndroidDevice } from "@/lib/pwa-install.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { toast } from "@/lib/toast";

const DEFAULT_PREFS = {
  messages: true,
  connection_requests: true,
  connection_accepted: true,
  shared_prospects: true,
  follow_up_reminders: true,
  sales_to_process: false,
  scheduled_notes: true,
};

const SOCIAL_PREFS = [
  {
    key: "messages",
    icon: MessageSquare,
    tone: "blue",
    titleKey: "settings.notifications.prefMessages",
    descKey: "settings.notifications.prefMessagesDesc",
  },
  {
    key: "connection_requests",
    icon: UserPlus,
    tone: "teal",
    titleKey: "settings.notifications.prefRequests",
    descKey: "settings.notifications.prefRequestsDesc",
  },
  {
    key: "connection_accepted",
    icon: CheckCircle2,
    tone: "green",
    titleKey: "settings.notifications.prefAccepted",
    descKey: "settings.notifications.prefAcceptedDesc",
  },
  {
    key: "shared_prospects",
    icon: FolderOpen,
    tone: "purple",
    titleKey: "settings.notifications.prefShared",
    descKey: "settings.notifications.prefSharedDesc",
  },
];

const OPS_PREFS = [
  {
    key: "follow_up_reminders",
    icon: CalendarClock,
    tone: "blue",
    titleKey: "settings.notifications.prefFollowUps",
    descKey: "settings.notifications.prefFollowUpsDesc",
  },
  {
    key: "sales_to_process",
    icon: CircleDollarSign,
    tone: "green",
    titleKey: "settings.notifications.prefSalesProcess",
    descKey: "settings.notifications.prefSalesProcessDesc",
  },
  {
    key: "scheduled_notes",
    icon: StickyNote,
    tone: "teal",
    titleKey: "settings.notifications.prefScheduledNotes",
    descKey: "settings.notifications.prefScheduledNotesDesc",
  },
];

function PrefToggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`notif-toggle${checked ? " is-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="notif-toggle-knob" />
    </button>
  );
}

function PrefRow({ item, checked, onChange, t }) {
  const Icon = item.icon;
  return (
    <div className="notif-pref-row">
      <div className={`notif-pref-icon tone-${item.tone}`} aria-hidden="true">
        <Icon size={18} strokeWidth={2.1} />
      </div>
      <div className="notif-pref-copy">
        <div className="notif-pref-title">{t(item.titleKey)}</div>
        <div className="notif-pref-desc">{t(item.descKey)}</div>
      </div>
      <PrefToggle
        checked={checked}
        onChange={onChange}
        label={t(item.titleKey)}
      />
    </div>
  );
}

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

  const notifications = {
    ...DEFAULT_PREFS,
    ...(settings?.notifications ?? {}),
  };

  const refreshStatus = () => {
    getPushStatus().then(setStatus).catch(() => {});
  };

  useEffect(() => {
    refreshStatus();
    const onStatus = () => refreshStatus();
    window.addEventListener("push:status-changed", onStatus);
    return () => window.removeEventListener("push:status-changed", onStatus);
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
      const result = await enablePushNotifications();
      refreshStatus();
      toastPushEnableResult(result, t);
      if (result.ok) await onSave?.();
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
      <div className="notif-panel">
        <div className="notif-status-card">
          <div className="notif-status-icon tone-blue" aria-hidden="true">
            <Bell size={20} />
          </div>
          <div className="notif-pref-copy">
            <div className="notif-pref-title">{t("settings.notifications.iosPwaRequired")}</div>
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={openInstallPrompt}>
          {t("settings.notifications.iosPwaInstall")}
        </button>
      </div>
    );
  }

  if (!isPushSupported()) {
    return (
      <div className="notif-panel">
        <div className="notif-status-card">
          <div className="notif-status-icon tone-muted" aria-hidden="true">
            <BellOff size={20} />
          </div>
          <div className="notif-pref-copy">
            <div className="notif-pref-title">{t("settings.notifications.unsupported")}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="notif-panel">
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

      <div className="notif-status-card">
        <div className={`notif-status-icon ${status.subscribed ? "tone-green" : "tone-muted"}`} aria-hidden="true">
          {status.subscribed ? <Bell size={20} /> : <BellOff size={20} />}
        </div>
        <div className="notif-pref-copy">
          <div className="notif-pref-title">{t("settings.notifications.status")}</div>
          <div className="notif-pref-desc">
            {status.subscribed
              ? t("settings.notifications.statusOn")
              : t("settings.notifications.statusOff")}
            {status.permission === "denied" ? ` — ${t("settings.notifications.denied")}` : ""}
          </div>
        </div>
        {!status.subscribed ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={pending || !status.pushConfigured}
            onClick={handleEnable}
          >
            {pending ? t("common.loading") : t("settings.notifications.enable")}
          </button>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={handleDisable}>
            {pending ? t("common.loading") : t("settings.notifications.disable")}
          </button>
        )}
      </div>

      {status.permission === "denied" && (
        <p className="settings-help" style={{ marginBottom: 12 }}>
          {t("settings.notifications.deniedHelp")}
        </p>
      )}

      <div className="notif-section-label">{t("settings.notifications.sectionSocial")}</div>
      <div className="notif-pref-list">
        {SOCIAL_PREFS.map((item) => (
          <PrefRow
            key={item.key}
            item={item}
            t={t}
            checked={Boolean(notifications[item.key])}
            onChange={(v) => setPref(item.key, v)}
          />
        ))}
      </div>

      <div className="notif-section-label">{t("settings.notifications.sectionOps")}</div>
      <div className="notif-pref-list">
        {OPS_PREFS.map((item) => (
          <PrefRow
            key={item.key}
            item={item}
            t={t}
            checked={Boolean(notifications[item.key])}
            onChange={(v) => setPref(item.key, v)}
          />
        ))}
      </div>

      <p className="settings-help" style={{ marginTop: 14 }}>
        {isAndroidDevice() ? t("settings.notifications.androidHint") : t("settings.notifications.pwaHint")}
      </p>
    </div>
  );
}
