import {
  getPushStatus,
  isPushSupported,
  needsIosPwaInstall,
  subscribeToPush,
  syncPushSubscription,
} from "@/lib/push-notifications.js";
import {
  canOfferPushPromptAlongsidePwa,
  markAutoPushRequested,
  markPushPromptPermanentlyBlocked,
  wasAutoPushRequested,
  wasPushPromptPermanentlyBlocked,
} from "@/lib/push-prompt.js";
import { isSupabaseConfigured } from "@/lib/supabase/config.js";
import { openInstallPrompt } from "@/lib/pwa-install.js";
import { toast } from "@/lib/toast";

export function notifyPushStatusChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("push:status-changed"));
}

/**
 * Activa push (permiso del navegador + suscripción OneSignal).
 * @returns {Promise<{ ok: true } | { ok: false, code: string }>}
 */
export async function enablePushNotifications() {
  try {
    await subscribeToPush();
    await syncPushSubscription();
    notifyPushStatusChanged();
    return { ok: true };
  } catch (err) {
    const code = err?.code || "UNKNOWN";
    if (code === "PERMISSION_DENIED") {
      markPushPromptPermanentlyBlocked();
    }
    notifyPushStatusChanged();
    return { ok: false, code };
  }
}

/**
 * Solicita permiso nativo una sola vez (primer uso / tras login).
 * Reutiliza enablePushNotifications — misma ruta que el botón manual en Settings.
 */
export async function maybeAutoEnablePushNotifications({ reason = "auto" } = {}) {
  if (typeof window === "undefined") {
    return { skipped: true, code: "NO_WINDOW" };
  }
  if (!isSupabaseConfigured() || !isPushSupported()) {
    return { skipped: true, code: "UNSUPPORTED" };
  }
  if (needsIosPwaInstall()) {
    return { skipped: true, code: "IOS_PWA_REQUIRED" };
  }
  if (wasAutoPushRequested() || wasPushPromptPermanentlyBlocked()) {
    return { skipped: true, code: "ALREADY_REQUESTED" };
  }
  if (!canOfferPushPromptAlongsidePwa()) {
    return { skipped: true, code: "PWA_FIRST" };
  }

  const status = await getPushStatus();
  if (!status.pushConfigured) {
    return { skipped: true, code: "NOT_CONFIGURED" };
  }
  if (status.subscribed) {
    markAutoPushRequested();
    return { skipped: true, code: "ALREADY_SUBSCRIBED" };
  }
  if (status.permission === "denied") {
    markPushPromptPermanentlyBlocked();
    markAutoPushRequested();
    return { skipped: true, code: "DENIED" };
  }

  markAutoPushRequested();
  const result = await enablePushNotifications();
  return { skipped: false, reason, ...result };
}

export function scheduleAutoPushRequest({ reason = "auto", delayMs = 800 } = {}) {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    void maybeAutoEnablePushNotifications({ reason });
  }, delayMs);
}

export function toastPushEnableResult(result, t) {
  if (result.ok) {
    toast.success(t("settings.notifications.enabled"));
    return;
  }
  switch (result.code) {
    case "PERMISSION_DENIED":
      toast.error(t("settings.notifications.deniedHelp"));
      break;
    case "PERMISSION_DISMISSED":
      toast.info(t("settings.notifications.dismissed"));
      break;
    case "IOS_PWA_REQUIRED":
      toast.error(t("settings.notifications.iosPwaRequired"));
      openInstallPrompt({ force: true });
      break;
    case "ONESIGNAL_NOT_CONFIGURED":
      toast.error(t("settings.notifications.serverNotConfigured"));
      break;
    case "PUSH_SERVICE_ERROR":
      toast.error(t("settings.notifications.pushServiceError"));
      break;
    default:
      toast.error(t("settings.notifications.error"));
      break;
  }
}
