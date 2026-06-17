import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const SDK_URL = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
let initPromise = null;
let sdkReady = null;

function getAppId() {
  return import.meta.env.VITE_ONESIGNAL_APP_ID || null;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar OneSignal."));
    document.head.appendChild(script);
  });
}

export function isOneSignalConfigured() {
  return Boolean(getAppId());
}

export function isPushSupported() {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "Notification" in window
    && isOneSignalConfigured();
}

export function getNotificationPermission() {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

async function resolveUserId() {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export async function ensureOneSignal() {
  if (!isOneSignalConfigured()) {
    throw new Error("OneSignal no está configurado en esta app.");
  }
  if (sdkReady) return sdkReady;

  if (!initPromise) {
    initPromise = (async () => {
      await loadScript(SDK_URL);
      const appId = getAppId();
      return new Promise((resolve, reject) => {
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        window.OneSignalDeferred.push(async (OneSignal) => {
          try {
            await OneSignal.init({
              appId,
              serviceWorkerPath: "onesignal/OneSignalSDKWorker.js",
              serviceWorkerParam: { scope: "/onesignal/" },
              notifyButton: { enable: false },
              allowLocalhostAsSecureOrigin: import.meta.env.DEV,
            });
            sdkReady = OneSignal;
            resolve(OneSignal);
          } catch (err) {
            reject(err);
          }
        });
      });
    })();
  }

  return initPromise;
}

export async function linkOneSignalUser(userId) {
  if (!userId) return;
  const OneSignal = await ensureOneSignal();
  await OneSignal.login(userId);
}

export async function unlinkOneSignalUser() {
  if (!sdkReady) return;
  await sdkReady.logout();
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

  const OneSignal = await ensureOneSignal();
  const userId = await resolveUserId();
  if (userId) await OneSignal.login(userId);

  await OneSignal.User.PushSubscription.optIn();

  const optedIn = OneSignal.User.PushSubscription.optedIn;
  if (!optedIn && Notification.permission !== "granted") {
    const err = new Error(Notification.permission === "denied" ? "PERMISSION_DENIED" : "PERMISSION_DISMISSED");
    err.code = Notification.permission === "denied" ? "PERMISSION_DENIED" : "PERMISSION_DISMISSED";
    throw err;
  }

  return { ok: true };
}

export async function unsubscribeFromPush() {
  const OneSignal = await ensureOneSignal();
  await OneSignal.User.PushSubscription.optOut();
  return { ok: true };
}

export async function getPushStatus() {
  if (!isPushSupported()) {
    return {
      supported: false,
      subscribed: false,
      permission: "unsupported",
      pushConfigured: false,
    };
  }

  let subscribed = false;
  let permission = Notification.permission;

  try {
    const OneSignal = await ensureOneSignal();
    subscribed = Boolean(OneSignal.User.PushSubscription.optedIn);
    permission = Notification.permission;
  } catch {
    subscribed = false;
  }

  return {
    supported: true,
    subscribed,
    permission,
    pushConfigured: true,
  };
}
