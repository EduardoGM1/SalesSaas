import { notificationsApi } from "@/lib/notifications-api.js";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isIosDevice, isStandaloneApp } from "@/lib/pwa-install.js";

const SDK_URL = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
const SW_PATH = "onesignal/OneSignalSDKWorker.js";
const SW_SCOPE = "/onesignal/";

let initPromise = null;
let sdkReady = null;
let resolvedAppId = null;
let serverConfigured = null;

function getBuildAppId() {
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

/** App ID embebido en build o obtenido del servidor en runtime. */
export async function resolveOneSignalAppId() {
  if (resolvedAppId) return resolvedAppId;
  const buildId = getBuildAppId();
  if (buildId) {
    resolvedAppId = buildId;
    return buildId;
  }
  if (!isSupabaseConfigured()) return null;
  try {
    const data = await notificationsApi.config();
    if (data?.appId) {
      resolvedAppId = data.appId;
      serverConfigured = data.configured !== false;
      return data.appId;
    }
  } catch {
    // Sin sesión o servidor sin OneSignal.
  }
  return null;
}

export async function resolveServerPushConfigured() {
  if (serverConfigured !== null) return serverConfigured;
  const buildId = getBuildAppId();
  if (buildId) {
    try {
      const status = await notificationsApi.status();
      serverConfigured = status?.push_configured === true;
      return serverConfigured;
    } catch {
      serverConfigured = true;
      return true;
    }
  }
  try {
    const data = await notificationsApi.config();
    serverConfigured = data?.configured === true;
    return serverConfigured;
  } catch {
    serverConfigured = false;
    return false;
  }
}

export function isBrowserPushCapable() {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "Notification" in window;
}

export function isOneSignalConfigured() {
  return Boolean(getBuildAppId() || resolvedAppId);
}

export function isPushSupported() {
  if (!isBrowserPushCapable() || !isSupabaseConfigured()) return false;
  if (isIosDevice() && !isStandaloneApp()) return false;
  return true;
}

export function needsIosPwaInstall() {
  return isIosDevice() && !isStandaloneApp();
}

function readSubscriptionState(OneSignal) {
  const push = OneSignal.User.PushSubscription;
  const optedIn = Boolean(push.optedIn);
  const subscriptionId = push.id || null;
  const token = push.token || null;
  return {
    optedIn,
    subscriptionId,
    token,
    subscribed: optedIn && Boolean(subscriptionId || token),
  };
}

export function getNotificationPermission() {
  if (!isBrowserPushCapable()) return "unsupported";
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

async function cleanupLegacyWebPushSubscription() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      const scope = registration.scope || "";
      if (scope.includes("/onesignal/")) continue;
      const sub = await registration.pushManager?.getSubscription();
      if (sub) await sub.unsubscribe();
    }
  } catch {
    // Suscripción legacy de VAPID u otro proveedor.
  }
}

async function waitForPushSubscription(OneSignal, timeoutMs = 15_000) {
  if (readSubscriptionState(OneSignal).subscribed) return true;

  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      OneSignal.User.PushSubscription.removeEventListener("change", onChange);
      clearTimeout(timer);
      resolve(value);
    };

    const onChange = () => {
      if (readSubscriptionState(OneSignal).subscribed) finish(true);
    };

    OneSignal.User.PushSubscription.addEventListener("change", onChange);
    const timer = window.setTimeout(
      () => finish(readSubscriptionState(OneSignal).subscribed),
      timeoutMs,
    );
  });
}

async function requestBrowserPermission(OneSignal) {
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;

  if (typeof OneSignal.Notifications?.requestPermission === "function") {
    await OneSignal.Notifications.requestPermission();
  } else {
    await Notification.requestPermission();
  }

  return Notification.permission === "granted";
}

export async function ensureOneSignal() {
  const appId = await resolveOneSignalAppId();
  if (!appId) {
    throw new Error("ONESIGNAL_NOT_CONFIGURED");
  }
  if (sdkReady) return sdkReady;

  if (!initPromise) {
    initPromise = (async () => {
      await loadScript(SDK_URL);
      return new Promise((resolve, reject) => {
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        window.OneSignalDeferred.push(async (OneSignal) => {
          try {
            await OneSignal.init({
              appId,
              serviceWorkerPath: SW_PATH,
              serviceWorkerParam: { scope: SW_SCOPE },
              notifyButton: { enable: false },
              allowLocalhostAsSecureOrigin: import.meta.env.DEV,
            });
            sdkReady = OneSignal;
            resolve(OneSignal);
          } catch (err) {
            initPromise = null;
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
  const state = readSubscriptionState(OneSignal);
  if (!state.subscribed) return;
  await OneSignal.login(userId);
}

export async function unlinkOneSignalUser() {
  if (!sdkReady) return;
  await sdkReady.logout();
}

export async function subscribeToPush() {
  if (needsIosPwaInstall()) {
    const err = new Error("IOS_PWA_REQUIRED");
    err.code = "IOS_PWA_REQUIRED";
    throw err;
  }

  if (!isBrowserPushCapable() || !isSupabaseConfigured()) {
    throw new Error("Este navegador no admite notificaciones push.");
  }

  const configured = await resolveServerPushConfigured();
  if (!configured) {
    const err = new Error("ONESIGNAL_NOT_CONFIGURED");
    err.code = "ONESIGNAL_NOT_CONFIGURED";
    throw err;
  }

  if (Notification.permission === "denied") {
    const err = new Error("PERMISSION_DENIED");
    err.code = "PERMISSION_DENIED";
    throw err;
  }

  await cleanupLegacyWebPushSubscription();

  const OneSignal = await ensureOneSignal();

  if (typeof OneSignal.Notifications?.isPushSupported === "function") {
    const supported = await OneSignal.Notifications.isPushSupported();
    if (!supported) {
      const err = new Error("PUSH_SERVICE_ERROR");
      err.code = "PUSH_SERVICE_ERROR";
      throw err;
    }
  }

  const granted = await requestBrowserPermission(OneSignal);
  if (!granted) {
    const err = new Error(Notification.permission === "denied" ? "PERMISSION_DENIED" : "PERMISSION_DISMISSED");
    err.code = Notification.permission === "denied" ? "PERMISSION_DENIED" : "PERMISSION_DISMISSED";
    throw err;
  }

  const userId = await resolveUserId();
  if (userId) await OneSignal.login(userId);

  try {
    await OneSignal.User.PushSubscription.optIn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/push service|registration failed/i.test(message)) {
      const mapped = new Error("PUSH_SERVICE_ERROR");
      mapped.code = "PUSH_SERVICE_ERROR";
      throw mapped;
    }
    throw err;
  }

  const subscribed = await waitForPushSubscription(OneSignal);
  if (!subscribed) {
    const err = new Error("PUSH_SERVICE_ERROR");
    err.code = "PUSH_SERVICE_ERROR";
    throw err;
  }

  if (userId) await OneSignal.login(userId);

  return readSubscriptionState(OneSignal);
}

export async function unsubscribeFromPush() {
  const OneSignal = await ensureOneSignal();
  await OneSignal.User.PushSubscription.optOut();
  return { ok: true };
}

export async function getPushStatus() {
  if (needsIosPwaInstall()) {
    return {
      supported: false,
      subscribed: false,
      permission: Notification.permission,
      pushConfigured: await resolveServerPushConfigured(),
      needsIosPwa: true,
      provider: "onesignal",
    };
  }

  if (!isBrowserPushCapable() || !isSupabaseConfigured()) {
    return {
      supported: false,
      subscribed: false,
      permission: "unsupported",
      pushConfigured: false,
    };
  }

  const pushConfigured = await resolveServerPushConfigured();
  const appId = await resolveOneSignalAppId();

  let subscribed = false;
  let subscriptionId = null;
  let permission = Notification.permission;

  if (appId) {
    try {
      const OneSignal = await ensureOneSignal();
      const state = readSubscriptionState(OneSignal);
      subscribed = state.subscribed;
      subscriptionId = state.subscriptionId;
      permission = Notification.permission;
    } catch {
      subscribed = false;
    }
  }

  return {
    supported: true,
    subscribed,
    subscriptionId,
    permission,
    pushConfigured: pushConfigured && Boolean(appId),
    needsResync: permission === "granted" && !subscribed,
    provider: "onesignal",
  };
}
