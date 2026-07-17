import {
  getPushStatus,
  isPushSupported,
  needsIosPwaInstall,
  subscribeToPush,
  syncPushIdentityAndSubscription,
} from "@/lib/push-notifications.js";
import {
  canOfferPushPromptAlongsidePwa,
  clearAutoPushRequested,
  markAutoPushRequested,
  markPushPromptPermanentlyBlocked,
  nudgePushPrompt,
  wasAutoPushRequested,
  wasPushPromptPermanentlyBlocked,
} from "@/lib/push-prompt.js";
import { isSupabaseConfigured } from "@/lib/supabase/config.js";
import { openInstallPrompt } from "@/lib/pwa-install.js";
import { unlockNotificationSound } from "@/lib/notification-sound.js";
import { toast } from "@/lib/toast";

export function notifyPushStatusChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("push:status-changed"));
}

/**
 * Activa push (permiso del navegador + suscripción OneSignal).
 * Debe llamarse desde un gesto de usuario (click/pointerdown) para el diálogo nativo.
 * @returns {Promise<{ ok: true } | { ok: false, code: string }>}
 */
export async function enablePushNotifications() {
  try {
    void unlockNotificationSound();
    await subscribeToPush();
    await syncPushIdentityAndSubscription();
    markAutoPushRequested();
    notifyPushStatusChanged();
    return { ok: true };
  } catch (err) {
    const code = err?.code || "UNKNOWN";
    if (code === "PERMISSION_DENIED") {
      markPushPromptPermanentlyBlocked();
      markAutoPushRequested();
    }
    notifyPushStatusChanged();
    return { ok: false, code };
  }
}

/**
 * Auto-enable. Preferir llamar desde gesto con delayMs=0 (ver AutoPushCoordinator).
 * No marca "ya pedido" si el permiso sigue en default (diálogo nunca mostrado).
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
  if (wasPushPromptPermanentlyBlocked()) {
    return { skipped: true, code: "ALREADY_REQUESTED" };
  }
  if (!canOfferPushPromptAlongsidePwa()) {
    return { skipped: true, code: "PWA_FIRST" };
  }

  // Checks síncronos de permiso ANTES de awaits (preservar gesto de usuario).
  if (typeof Notification !== "undefined" && Notification.permission === "denied") {
    markPushPromptPermanentlyBlocked();
    markAutoPushRequested();
    return { skipped: true, code: "DENIED" };
  }

  if (wasAutoPushRequested() && Notification.permission === "default") {
    clearAutoPushRequested();
  } else if (wasAutoPushRequested()) {
    return { skipped: true, code: "ALREADY_REQUESTED" };
  }

  // Si aún hay gesto: pedir permiso ya (subscribeToPush también lo hace primero).
  const result = await enablePushNotifications();

  if (result.ok || result.code === "PERMISSION_DENIED") {
    markAutoPushRequested();
  }

  // Validar configuración solo para telemetría de skip codes en callers.
  if (!result.ok && result.code === "ONESIGNAL_NOT_CONFIGURED") {
    return { skipped: false, reason, ...result };
  }

  try {
    const status = await getPushStatus();
    if (status.subscribed) markAutoPushRequested();
  } catch {
    // ignore
  }

  return { skipped: false, reason, ...result };
}

/**
 * @param {{ reason?: string, delayMs?: number, preferBanner?: boolean }} opts
 */
export function scheduleAutoPushRequest({ reason = "auto", delayMs = 0, preferBanner = false } = {}) {
  if (typeof window === "undefined") return;

  const run = () => {
    if (preferBanner) {
      nudgePushPrompt({ contextual: true });
      return;
    }
    void maybeAutoEnablePushNotifications({ reason }).then((result) => {
      if (result?.ok) return;
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        nudgePushPrompt({ contextual: true });
      }
    });
  };

  if (!delayMs) {
    run();
    return;
  }
  window.setTimeout(run, delayMs);
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
    case "SW_UNREACHABLE":
      toast.error(t("settings.notifications.swUnreachable"));
      break;
    case "SW_REGISTER_FAILED":
      toast.error(t("settings.notifications.swRegisterFailed"));
      break;
    case "PUSH_UNSUPPORTED":
      toast.error(t("settings.notifications.pushUnsupported"));
      break;
    case "EXTERNAL_ID_LINK_FAILED":
      toast.error(t("settings.notifications.externalIdLinkError"));
      break;
    default:
      toast.error(t("settings.notifications.error"));
      break;
  }
}
