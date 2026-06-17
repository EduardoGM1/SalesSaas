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

async function resolveVapidPublicKey() {
  const envKey = import.meta.env?.VITE_VAPID_PUBLIC_KEY;
  if (envKey) return envKey;
  const data = await notificationsApi.vapidPublicKey();
  return data?.publicKey;
}

export async function getServiceWorkerRegistration() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.ready;
}

export async function subscribeToPush() {
  if (!isPushSupported()) {
    throw new Error("Este navegador no admite notificaciones push.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Permiso de notificaciones denegado.");
  }

  const publicKey = await resolveVapidPublicKey();
  if (!publicKey) {
    throw new Error("El servidor no tiene configuradas las notificaciones push.");
  }

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
    return { supported: false, subscribed: false, permission: "unsupported" };
  }

  const registration = await getServiceWorkerRegistration();
  const subscription = await registration?.pushManager?.getSubscription();
  let serverSubscribed = false;
  try {
    const status = await notificationsApi.status();
    serverSubscribed = Boolean(status?.subscribed);
  } catch {
    serverSubscribed = Boolean(subscription);
  }

  return {
    supported: true,
    subscribed: Boolean(subscription) && serverSubscribed,
    permission: Notification.permission,
  };
}
