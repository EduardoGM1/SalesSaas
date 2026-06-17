import { notificationsApi } from "@/lib/notifications-api.js";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw], (c) => c.charCodeAt(0));
}

export function isPushSupported() {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

export function getNotificationPermission() {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

async function resolveVapidPublicKey() {
  const envKey = import.meta.env?.VITE_VAPID_PUBLIC_KEY;
  if (envKey) return { publicKey: envKey, configured: true };
  try {
    const data = await notificationsApi.vapidPublicKey();
    return {
      publicKey: data?.publicKey,
      configured: data?.configured !== false,
    };
  } catch {
    return { publicKey: null, configured: false };
  }
}

export async function getServiceWorkerRegistration() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

async function ensureBrowserSubscription(publicKey) {
  const registration = await getServiceWorkerRegistration();
  if (!registration?.pushManager) {
    throw new Error("Service worker no disponible.");
  }

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  return subscription;
}

export async function syncPushSubscription() {
  if (!isPushSupported()) return { synced: false, reason: "unsupported" };
  if (Notification.permission !== "granted") {
    return { synced: false, reason: Notification.permission };
  }

  const { publicKey, configured } = await resolveVapidPublicKey();
  if (!publicKey || !configured) {
    return { synced: false, reason: "server_not_configured" };
  }

  const registration = await getServiceWorkerRegistration();
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) {
    return { synced: false, reason: "no_browser_subscription" };
  }

  const json = subscription.toJSON();
  await notificationsApi.subscribe({
    endpoint: json.endpoint,
    keys: json.keys,
  });

  return { synced: true };
}

export async function subscribeToPush() {
  if (!isPushSupported()) {
    throw new Error("Este navegador no admite notificaciones push.");
  }

  const permission = Notification.permission;
  if (permission === "denied") {
    const err = new Error("PERMISSION_DENIED");
    err.code = "PERMISSION_DENIED";
    throw err;
  }

  const nextPermission = permission === "granted"
    ? "granted"
    : await Notification.requestPermission();

  if (nextPermission !== "granted") {
    const err = new Error(nextPermission === "denied" ? "PERMISSION_DENIED" : "PERMISSION_DISMISSED");
    err.code = nextPermission === "denied" ? "PERMISSION_DENIED" : "PERMISSION_DISMISSED";
    throw err;
  }

  const { publicKey, configured } = await resolveVapidPublicKey();
  if (!publicKey || !configured) {
    throw new Error("El servidor no tiene configuradas las notificaciones push.");
  }

  const subscription = await ensureBrowserSubscription(publicKey);
  const json = subscription.toJSON();
  await notificationsApi.subscribe({
    endpoint: json.endpoint,
    keys: json.keys,
  });

  return subscription;
}

export async function unsubscribeFromPush() {
  const registration = await getServiceWorkerRegistration();
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) return { ok: true };

  const endpoint = subscription.endpoint;
  await notificationsApi.unsubscribe(endpoint).catch(() => {});
  await subscription.unsubscribe();
  return { ok: true };
}

export async function getPushStatus() {
  if (!isPushSupported()) {
    return {
      supported: false,
      subscribed: false,
      permission: "unsupported",
      pushConfigured: false,
      needsSync: false,
    };
  }

  const registration = await getServiceWorkerRegistration();
  const subscription = await registration?.pushManager?.getSubscription();
  let serverSubscribed = false;
  let pushConfigured = Boolean(import.meta.env?.VITE_VAPID_PUBLIC_KEY);

  try {
    const status = await notificationsApi.status();
    serverSubscribed = Boolean(status?.subscribed);
    pushConfigured = status?.push_configured !== false;
  } catch {
    serverSubscribed = Boolean(subscription);
  }

  const browserSubscribed = Boolean(subscription);
  const permission = Notification.permission;

  return {
    supported: true,
    subscribed: browserSubscribed && serverSubscribed,
    browserSubscribed,
    serverSubscribed,
    needsSync: browserSubscribed && !serverSubscribed && permission === "granted",
    pushConfigured,
    permission,
  };
}
