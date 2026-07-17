import { PushType, messagePath, networkPath, contactPath, sharedProspectPath } from "@salesapp/shared/push/notification-targets.js";
import { getInstallPlatform } from "@/lib/pwa-install.js";
import { playNotificationSound } from "@/lib/notification-sound.js";
import { toast } from "@/lib/toast";
import { useDbStore } from "@/stores/db-store";

const recent = new Map();
const DEDUPE_MS = 8_000;

const TYPE_TO_PREF = {
  [PushType.MESSAGE]: "messages",
  [PushType.CONNECTION_REQUEST]: "connection_requests",
  [PushType.CONNECTION_ACCEPTED]: "connection_accepted",
  [PushType.SHARED_PROSPECT]: "shared_prospects",
  [PushType.PROSPECT_SECTION_CHANGED]: "shared_prospects",
  [PushType.FOLLOW_UP_REMINDER]: "follow_up_reminders",
  [PushType.SALES_TO_PROCESS]: "sales_to_process",
  [PushType.SCHEDULED_NOTE]: "scheduled_notes",
};

function prune(now) {
  for (const [k, t] of recent) {
    if (now - t > 30_000) recent.delete(k);
  }
}

export function getNotificationPrefs() {
  const notifications = useDbStore.getState()?.db?.settings?.notifications ?? {};
  return {
    messages: notifications.messages !== false,
    connection_requests: notifications.connection_requests !== false,
    connection_accepted: notifications.connection_accepted !== false,
    shared_prospects: notifications.shared_prospects !== false,
    follow_up_reminders: notifications.follow_up_reminders !== false,
    sales_to_process: notifications.sales_to_process === true,
    scheduled_notes: notifications.scheduled_notes !== false,
  };
}

export function isNotificationTypeEnabled(type) {
  if (!type || type === PushType.SESSION_REVOKED) return true;
  const prefKey = TYPE_TO_PREF[type];
  if (!prefKey) return true;
  return getNotificationPrefs()[prefKey] !== false;
}

/**
 * Toast in-app (siempre) + sonido en desktop.
 * Independiente de Notification.permission / OneSignal.
 * @returns {boolean} true si se mostró
 */
export function presentInAppNotification({
  type,
  title,
  body,
  path,
  dedupeKey,
  playSound = true,
} = {}) {
  if (typeof window === "undefined") return false;
  if (type === PushType.SESSION_REVOKED) return false;
  if (!isNotificationTypeEnabled(type)) return false;

  const line = [String(title || "").trim(), String(body || "").trim()].filter(Boolean).join(" — ");
  if (!line) return false;

  const now = Date.now();
  prune(now);
  const key = String(dedupeKey || `${type}:${line}`).slice(0, 180);
  const windowKey = `win:${type}:${line.slice(0, 100)}`;
  if (recent.has(key) && now - recent.get(key) < DEDUPE_MS) return false;
  if (recent.has(windowKey) && now - recent.get(windowKey) < DEDUPE_MS) return false;
  recent.set(key, now);
  recent.set(windowKey, now);

  toast.notify({
    message: line,
    duration: 5500,
    href: typeof path === "string" && path.startsWith("/") ? path : null,
  });

  if (playSound && getInstallPlatform() === "desktop") {
    void playNotificationSound();
  }

  return true;
}

export function presentFromPushNotification(notification) {
  const data = notification?.additionalData || {};
  const type = data.type || null;
  const title = notification?.title || "";
  const body = notification?.body || "";
  const path = data.path
    || (type === PushType.MESSAGE && data.senderId ? messagePath(data.senderId) : null)
    || (type === PushType.CONNECTION_REQUEST || type === PushType.CONNECTION_ACCEPTED
      ? networkPath()
      : null);

  return presentInAppNotification({
    type,
    title,
    body,
    path,
    dedupeKey: `push:${type}:${title}:${body}`,
  });
}

export { messagePath, networkPath, contactPath, sharedProspectPath, PushType };
