import { getInstallPlatform } from "@/lib/pwa-install.js";

const ENABLED_KEY = "desktop_local_notifications";

/** Desktop web no usa OneSignal (Chrome push service error); móvil sí. */
export function usesOneSignalPush() {
  return getInstallPlatform() !== "desktop";
}

export function isDesktopLocalNotificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function isDesktopLocalNotificationsEnabled() {
  if (!isDesktopLocalNotificationsSupported()) return false;
  if (Notification.permission !== "granted") return false;
  if (typeof localStorage === "undefined") return Notification.permission === "granted";
  return localStorage.getItem(ENABLED_KEY) !== "0";
}

export function markDesktopLocalNotificationsEnabled() {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(ENABLED_KEY, "1");
}

export function markDesktopLocalNotificationsDisabled() {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(ENABLED_KEY, "0");
}

/**
 * Activa avisos locales en desktop: solo permiso del navegador (sin Web Push / FCM / OneSignal).
 * Debe llamarse desde un gesto de usuario.
 */
export async function enableDesktopLocalNotifications() {
  if (!isDesktopLocalNotificationsSupported()) {
    const err = new Error("PUSH_UNSUPPORTED");
    err.code = "PUSH_UNSUPPORTED";
    throw err;
  }

  if (Notification.permission === "denied") {
    const err = new Error("PERMISSION_DENIED");
    err.code = "PERMISSION_DENIED";
    throw err;
  }

  if (Notification.permission === "default") {
    const result = await Notification.requestPermission();
    if (result === "denied") {
      const err = new Error("PERMISSION_DENIED");
      err.code = "PERMISSION_DENIED";
      throw err;
    }
    if (result !== "granted") {
      const err = new Error("PERMISSION_DISMISSED");
      err.code = "PERMISSION_DISMISSED";
      throw err;
    }
  }

  markDesktopLocalNotificationsEnabled();
  return {
    ok: true,
    provider: "desktop-local",
    permission: Notification.permission,
  };
}

export async function disableDesktopLocalNotifications() {
  markDesktopLocalNotificationsDisabled();
  return { ok: true };
}

export function getDesktopLocalNotificationStatus() {
  const supported = isDesktopLocalNotificationsSupported();
  const permission = supported ? Notification.permission : "unsupported";
  const subscribed = supported && isDesktopLocalNotificationsEnabled();
  return {
    supported,
    subscribed,
    permission,
    pushConfigured: true,
    needsResync: false,
    pushServiceFailed: false,
    needsIosPwa: false,
    provider: "desktop-local",
    subscriptionId: null,
    externalId: null,
  };
}

/**
 * Notificación nativa del SO sin Web Push (solo con pestaña/proceso vivo).
 * Si la app está en primer plano, el toast in-app basta; aquí reforzamos cuando está oculta.
 */
export function showDesktopLocalNotification({ title, body, href = null } = {}) {
  if (!isDesktopLocalNotificationsEnabled()) return false;
  if (typeof document !== "undefined" && document.visibilityState === "visible") {
    // Toast in-app cubre el foreground.
    return false;
  }

  try {
    const n = new Notification(title || "Saletse", {
      body: body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: href ? `saletse:${href}` : undefined,
    });
    if (href) {
      n.onclick = () => {
        try {
          window.focus();
          if (href.startsWith("/")) window.location.assign(href);
        } catch {
          // ignore
        }
        n.close();
      };
    }
    return true;
  } catch (err) {
    console.warn("[desktop-notifications] show failed:", err);
    return false;
  }
}
