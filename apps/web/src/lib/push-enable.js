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
import { reportOneSignalPushIssue } from "@/lib/observability.js";

const KNOWN_PUSH_CODES = new Set([
  "PERMISSION_DENIED",
  "PERMISSION_DISMISSED",
  "IOS_PWA_REQUIRED",
  "ONESIGNAL_NOT_CONFIGURED",
  "PUSH_SERVICE_ERROR",
  "SW_UNREACHABLE",
  "SW_REGISTER_FAILED",
  "PUSH_UNSUPPORTED",
  "EXTERNAL_ID_LINK_FAILED",
]);

/** Una sola suscripción en vuelo: evita carreras pointerdown + click + login. */
let enableInFlight = null;

export function notifyPushStatusChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("push:status-changed"));
}

function normalizePushErrorCode(err) {
  if (err?.code && KNOWN_PUSH_CODES.has(err.code)) return err.code;
  const message = typeof err?.message === "string" ? err.message : "";
  if (KNOWN_PUSH_CODES.has(message)) return message;
  return "UNKNOWN";
}

/**
 * Activa push (permiso del navegador + suscripción OneSignal).
 * Debe llamarse desde un gesto de usuario (click/pointerdown) para el diálogo nativo.
 * Single-flight: llamadas concurrentes comparten la misma Promise.
 * @returns {Promise<{ ok: true } | { ok: false, code: string, detail?: string|null }>}
 */
export async function enablePushNotifications() {
  if (enableInFlight) return enableInFlight;

  enableInFlight = (async () => {
    try {
      void unlockNotificationSound();
      await subscribeToPush();
      await syncPushIdentityAndSubscription();
      markAutoPushRequested();
      notifyPushStatusChanged();
      return { ok: true };
    } catch (err) {
      const code = normalizePushErrorCode(err);
      const detail = err?.detail || err?.message || null;
      console.error("[push] enablePushNotifications failed:", code, detail, err);
      void reportOneSignalPushIssue({
        stage: "enablePushNotifications",
        code,
        detail,
        permission: typeof Notification !== "undefined" ? Notification.permission : null,
        error: err instanceof Error ? err : new Error(String(detail || code)),
        message: `Push enable failed: ${code}${detail ? ` — ${detail}` : ""}`,
      });
      if (code === "PERMISSION_DENIED") {
        markPushPromptPermanentlyBlocked();
        markAutoPushRequested();
      }
      notifyPushStatusChanged();
      return { ok: false, code, detail };
    } finally {
      enableInFlight = null;
    }
  })();

  return enableInFlight;
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

const TOAST_GROUP = "push-enable-result";

export function toastPushEnableResult(result, t) {
  if (result.ok) {
    toast.success(t("settings.notifications.enabled"), { groupKey: TOAST_GROUP });
    return;
  }
  switch (result.code) {
    case "PERMISSION_DENIED":
      toast.error(t("settings.notifications.deniedHelp"), { groupKey: TOAST_GROUP });
      break;
    case "PERMISSION_DISMISSED":
      toast.info(t("settings.notifications.dismissed"), { groupKey: TOAST_GROUP });
      break;
    case "IOS_PWA_REQUIRED":
      toast.error(t("settings.notifications.iosPwaRequired"), { groupKey: TOAST_GROUP });
      openInstallPrompt({ force: true });
      break;
    case "ONESIGNAL_NOT_CONFIGURED":
      toast.error(t("settings.notifications.serverNotConfigured"), { groupKey: TOAST_GROUP });
      break;
    case "PUSH_SERVICE_ERROR":
      toast.error(t("settings.notifications.pushServiceError"), { groupKey: TOAST_GROUP });
      break;
    case "SW_UNREACHABLE":
      toast.error(t("settings.notifications.swUnreachable"), { groupKey: TOAST_GROUP });
      break;
    case "SW_REGISTER_FAILED":
      toast.error(t("settings.notifications.swRegisterFailed"), { groupKey: TOAST_GROUP });
      if (result.detail) console.error("[push] SW_REGISTER_FAILED detail:", result.detail);
      break;
    case "PUSH_UNSUPPORTED":
      toast.error(t("settings.notifications.pushUnsupported"), { groupKey: TOAST_GROUP });
      break;
    case "EXTERNAL_ID_LINK_FAILED":
      toast.error(t("settings.notifications.externalIdLinkError"), { groupKey: TOAST_GROUP });
      break;
    default:
      toast.error(t("settings.notifications.error"), { groupKey: TOAST_GROUP });
      if (result.detail) console.error("[push] UNKNOWN detail:", result.detail);
      break;
  }
}
