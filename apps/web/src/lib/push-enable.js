import { subscribeToPush, syncPushSubscription } from "@/lib/push-notifications.js";
import { markPushPromptPermanentlyBlocked } from "@/lib/push-prompt.js";
import { openInstallPrompt } from "@/lib/pwa-install.js";
import { toast } from "@/lib/toast";

/**
 * Activa push (permiso del navegador + suscripción OneSignal).
 * @returns {Promise<{ ok: true } | { ok: false, code: string }>}
 */
export async function enablePushNotifications() {
  try {
    await subscribeToPush();
    await syncPushSubscription();
    return { ok: true };
  } catch (err) {
    const code = err?.code || "UNKNOWN";
    if (code === "PERMISSION_DENIED") {
      markPushPromptPermanentlyBlocked();
    }
    return { ok: false, code };
  }
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
