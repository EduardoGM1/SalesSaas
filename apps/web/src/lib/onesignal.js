import { notificationsApi } from "@/lib/notifications-api.js";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getInstallPlatform, isIosDevice, isStandaloneApp } from "@/lib/pwa-install.js";
import { reportOneSignalLinkIssue } from "@/lib/observability.js";
import { PushType, resolvePushPathFromPayload } from "@salesapp/shared/push/notification-targets.js";
import { clearLocalSession } from "@/lib/session-api.js";
import { presentFromPushNotification } from "@/lib/in-app-notifications.js";

const SDK_URL = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
/** Ruta relativa desde el origen (sin slash inicial), según docs OneSignal Custom Code. */
const SW_PATH = "onesignal/OneSignalSDKWorker.js";
/** Scope dedicado para no chocar con el SW de la PWA (Workbox en `/`). */
const SW_SCOPE = "/onesignal/";
const SW_URL = `/${SW_PATH}`;

let initPromise = null;
let sdkReady = null;
let resolvedAppId = null;
let serverConfigured = null;

function getBuildSafariWebId() {
  return import.meta.env.VITE_ONESIGNAL_SAFARI_WEB_ID || null;
}

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

let resolvedSafariWebId = null;

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

export async function resolveSafariWebId() {
  if (resolvedSafariWebId) return resolvedSafariWebId;
  const buildId = getBuildSafariWebId();
  if (buildId) {
    resolvedSafariWebId = buildId;
    return buildId;
  }
  if (!isSupabaseConfigured()) return null;
  try {
    const data = await notificationsApi.config();
    if (data?.safariWebId) {
      resolvedSafariWebId = data.safariWebId;
      return data.safariWebId;
    }
  } catch {
    // Sin sesión.
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

/**
 * Comprueba que el SW de OneSignal se sirve como JS (no HTML de la SPA).
 * Fallo típico: rewrite catch-all → index.html → registration failed.
 */
async function preflightOneSignalServiceWorker() {
  const url = `${window.location.origin}${SW_URL}?preflight=${Date.now()}`;
  let res;
  try {
    res = await fetch(url, { method: "GET", cache: "no-store", credentials: "same-origin" });
  } catch (err) {
    const mapped = new Error("SW_UNREACHABLE");
    mapped.code = "SW_UNREACHABLE";
    mapped.cause = err;
    throw mapped;
  }

  const contentType = String(res.headers.get("content-type") || "").toLowerCase();
  const text = await res.text();
  const looksLikeJs = /importScripts\s*\(/.test(text) && !/<!DOCTYPE html|<html/i.test(text);
  const okType = contentType.includes("javascript") || contentType.includes("ecmascript") || contentType === "";

  if (!res.ok || !looksLikeJs || (!okType && contentType.includes("html"))) {
    console.warn("[onesignal] SW preflight failed:", {
      url,
      status: res.status,
      contentType,
      bodyPreview: text.slice(0, 120),
    });
    const mapped = new Error("SW_UNREACHABLE");
    mapped.code = "SW_UNREACHABLE";
    throw mapped;
  }

  return true;
}

/** Registra el SW de OneSignal en scope dedicado y espera activación. */
async function ensureOneSignalServiceWorkerRegistered() {
  if (!("serviceWorker" in navigator)) {
    const mapped = new Error("PUSH_UNSUPPORTED");
    mapped.code = "PUSH_UNSUPPORTED";
    throw mapped;
  }

  await preflightOneSignalServiceWorker();

  let registration;
  try {
    registration = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
  } catch (err) {
    console.warn("[onesignal] SW register failed:", err);
    const mapped = new Error("SW_REGISTER_FAILED");
    mapped.code = "SW_REGISTER_FAILED";
    mapped.cause = err;
    throw mapped;
  }

  const worker = registration.installing || registration.waiting || registration.active;
  if (worker && worker.state !== "activated") {
    await new Promise((resolve) => {
      const done = () => resolve();
      worker.addEventListener("statechange", () => {
        if (worker.state === "activated" || worker.state === "redundant") done();
      });
      window.setTimeout(done, 8_000);
    });
  }

  try {
    await registration.update();
  } catch {
    // update() puede fallar offline; el registro existente basta.
  }

  return registration;
}

export async function ensureOneSignal() {
  const appId = await resolveOneSignalAppId();
  if (!appId) {
    throw new Error("ONESIGNAL_NOT_CONFIGURED");
  }
  if (sdkReady) return sdkReady;

  if (!initPromise) {
    initPromise = (async () => {
      try {
        await navigator.serviceWorker?.register(SW_URL, { scope: SW_SCOPE });
      } catch (err) {
        console.warn("[onesignal] early SW register skipped:", err);
      }
      await loadScript(SDK_URL);
      return new Promise((resolve, reject) => {
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        window.OneSignalDeferred.push(async (OneSignal) => {
          try {
            const safariWebId = await resolveSafariWebId();
            await OneSignal.init({
              appId,
              ...(safariWebId ? { safari_web_id: safariWebId } : {}),
              serviceWorkerPath: SW_PATH,
              serviceWorkerParam: { scope: SW_SCOPE },
              notifyButton: { enable: false },
              allowLocalhostAsSecureOrigin: import.meta.env.DEV,
              autoResubscribe: true,
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

async function registerDeviceSubscription(subscriptionId) {
  if (!subscriptionId) return { ok: false, reason: "no_id" };
  try {
    await notificationsApi.registerDevice(subscriptionId);
    return { ok: true };
  } catch (err) {
    console.warn("[onesignal] registerDeviceSubscription failed:", err);
    return { ok: false, error: err };
  }
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function notifyPushStatusChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("push:status-changed"));
}

function readExternalId(OneSignal) {
  const id = OneSignal.User.externalId;
  return id != null && id !== "" ? String(id) : null;
}

async function waitForExternalIdMatch(OneSignal, userId, timeoutMs = 6000) {
  const expected = String(userId);
  if (readExternalId(OneSignal) === expected) {
    return { ok: true, externalId: expected };
  }

  return new Promise((resolve) => {
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      try {
        OneSignal.User.removeEventListener("change", onChange);
      } catch {
        // SDK no soporta remove en algunas versiones.
      }
      clearTimeout(timer);
      resolve(result);
    };

    const onChange = () => {
      if (readExternalId(OneSignal) === expected) {
        finish({ ok: true, externalId: expected });
      }
    };

    OneSignal.User.addEventListener("change", onChange);
    const timer = window.setTimeout(() => {
      finish({ ok: false, externalId: readExternalId(OneSignal) });
    }, timeoutMs);
  });
}

export async function isOneSignalExternalIdLinked(userId) {
  if (!userId) return false;
  try {
    const OneSignal = await ensureOneSignal();
    return readExternalId(OneSignal) === String(userId);
  } catch {
    return false;
  }
}

export async function linkOneSignalUser(userId, { retries = 3, verifyTimeoutMs = 6000 } = {}) {
  if (!userId) return { ok: false, reason: "no_user" };
  const OneSignal = await ensureOneSignal();
  const expected = String(userId);
  let lastErr = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      await OneSignal.login(expected);
      const verified = await waitForExternalIdMatch(OneSignal, expected, verifyTimeoutMs);
      if (verified.ok) {
        return {
          ok: true,
          externalId: verified.externalId,
          onesignalId: OneSignal.User.onesignalId || null,
        };
      }
      lastErr = new Error(
        `external_id mismatch: expected ${expected}, got ${verified.externalId ?? "null"}`,
      );
    } catch (err) {
      lastErr = err;
    }
    if (attempt < retries - 1) await delay(400 * (attempt + 1));
  }

  const pushState = readSubscriptionState(OneSignal);
  void reportOneSignalLinkIssue({
    stage: "linkOneSignalUser",
    userId: expected,
    externalId: readExternalId(OneSignal),
    onesignalId: OneSignal.User.onesignalId || null,
    subscriptionId: pushState.subscriptionId,
    subscribed: pushState.subscribed,
    error: lastErr,
    message: lastErr instanceof Error ? lastErr.message : String(lastErr),
  });

  console.warn("[onesignal] linkOneSignalUser failed after retries:", lastErr);
  return { ok: false, error: lastErr, externalId: readExternalId(OneSignal) };
}

export async function unlinkOneSignalUser() {
  if (!sdkReady) return;
  await sdkReady.logout();
}

let notificationHandlersAttached = false;

function readNotificationPayload(notification) {
  return notification?.additionalData
    || notification?.data
    || {};
}

export function resolveNotificationTarget(notification) {
  const payload = readNotificationPayload(notification);
  const fromPayload = resolvePushPathFromPayload({
    ...payload,
    url: payload.url
      || notification?.launchURL
      || notification?.launchUrl,
    launchURL: notification?.launchURL,
    launchUrl: notification?.launchUrl,
  });
  if (fromPayload) return fromPayload;

  const url = notification?.launchURL || notification?.launchUrl || payload?.url;
  if (!url) return null;
  try {
    const target = new URL(url, window.location.origin);
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

export function navigateToPushTarget(notification, onNavigate) {
  const target = resolveNotificationTarget(notification);
  if (!target) return false;

  if (onNavigate) {
    onNavigate(target);
    return true;
  }

  const url = notification?.launchURL || notification?.launchUrl || readNotificationPayload(notification)?.url;
  if (url) {
    try {
      const parsed = new URL(url, window.location.origin);
      if (parsed.origin === window.location.origin) {
        window.location.assign(`${parsed.pathname}${parsed.search}${parsed.hash}`);
        return true;
      }
      window.location.assign(url);
      return true;
    } catch {
      window.location.assign(url);
      return true;
    }
  }

  window.location.assign(target);
  return true;
}

/** Muestra push en primer plano y navega al pulsar la notificación. */
export async function setupPushNotificationHandlers({ onNavigate } = {}) {
  const OneSignal = await ensureOneSignal();
  if (notificationHandlersAttached) return;
  notificationHandlersAttached = true;

  OneSignal.Notifications.addEventListener("foregroundWillDisplay", (event) => {
    const data = event.notification?.additionalData || {};
    if (data.type === PushType.SESSION_REVOKED) {
      // No molestar con banner: cerrar sesión local al instante.
      try {
        event.preventDefault();
      } catch {
        // SDK antiguo sin preventDefault.
      }
      clearLocalSession();
      return;
    }
    // Desktop: toast+sonido in-app (también llega por Realtime). Móvil: solo nativo.
    if (getInstallPlatform() === "desktop") {
      presentFromPushNotification(event.notification);
    }
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      event.notification.display();
    }
  });

  OneSignal.Notifications.addEventListener("click", (event) => {
    const data = event.notification?.additionalData || {};
    if (data.type === PushType.SESSION_REVOKED) {
      clearLocalSession().finally(() => {
        navigateToPushTarget(event.notification, onNavigate);
      });
      return;
    }
    navigateToPushTarget(event.notification, onNavigate);
  });
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

  if (Notification.permission === "denied") {
    const err = new Error("PERMISSION_DENIED");
    err.code = "PERMISSION_DENIED";
    throw err;
  }

  // Pedir permiso ANTES de cualquier await largo: Chrome/Edge exigen gesto de usuario.
  // Si se espera a SW/OneSignal.init, el diálogo nativo no aparece (queda en "default").
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      // Algunos entornos solo aceptan el método del SDK; se reintenta abajo.
    }
  }
  if (Notification.permission === "denied") {
    const err = new Error("PERMISSION_DENIED");
    err.code = "PERMISSION_DENIED";
    throw err;
  }
  if (Notification.permission !== "granted") {
    const err = new Error("PERMISSION_DISMISSED");
    err.code = "PERMISSION_DISMISSED";
    throw err;
  }

  const configured = await resolveServerPushConfigured();
  if (!configured) {
    const err = new Error("ONESIGNAL_NOT_CONFIGURED");
    err.code = "ONESIGNAL_NOT_CONFIGURED";
    throw err;
  }

  await cleanupLegacyWebPushSubscription();

  // Asegura SW OneSignal activo antes de optIn (crítico en Android PWA + Workbox).
  await ensureOneSignalServiceWorkerRegistered();

  const OneSignal = await ensureOneSignal();

  if (typeof OneSignal.Notifications?.isPushSupported === "function") {
    const supported = await OneSignal.Notifications.isPushSupported();
    if (!supported) {
      const err = new Error("PUSH_UNSUPPORTED");
      err.code = "PUSH_UNSUPPORTED";
      throw err;
    }
  }

  // Refuerzo por si el permiso se concedió vía OneSignal en builds antiguos.
  const granted = await requestBrowserPermission(OneSignal);
  if (!granted) {
    const err = new Error(Notification.permission === "denied" ? "PERMISSION_DENIED" : "PERMISSION_DISMISSED");
    err.code = Notification.permission === "denied" ? "PERMISSION_DENIED" : "PERMISSION_DISMISSED";
    throw err;
  }

  const userId = await resolveUserId();

  try {
    await OneSignal.User.PushSubscription.optIn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[onesignal] optIn failed:", message, err);
    if (/service worker|failed to register|bad HTTP|unsupported MIME|redirect/i.test(message)) {
      const mapped = new Error("SW_REGISTER_FAILED");
      mapped.code = "SW_REGISTER_FAILED";
      mapped.cause = err;
      throw mapped;
    }
    if (/push service|registration failed/i.test(message)) {
      const mapped = new Error("PUSH_SERVICE_ERROR");
      mapped.code = "PUSH_SERVICE_ERROR";
      mapped.cause = err;
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

  // Vincular external_id DESPUÉS de que exista la suscripción (playerId/subscription id).
  if (userId) {
    const linkResult = await linkOneSignalUser(userId);
    if (!linkResult.ok) {
      const err = new Error("EXTERNAL_ID_LINK_FAILED");
      err.code = "EXTERNAL_ID_LINK_FAILED";
      throw err;
    }
  }

  await registerDeviceSubscription(readSubscriptionState(OneSignal).subscriptionId);

  return readSubscriptionState(OneSignal);
}

export async function restorePushSubscriptionIfNeeded() {
  if (!isBrowserPushCapable() || !isSupabaseConfigured()) return { restored: false };
  if (Notification.permission !== "granted") return { restored: false };

  const configured = await resolveServerPushConfigured();
  if (!configured) return { restored: false };

  try {
    const OneSignal = await ensureOneSignal();
    const before = readSubscriptionState(OneSignal);
    const userId = await resolveUserId();

    if (before.subscribed) {
      if (userId) await linkOneSignalUser(userId);
      await registerDeviceSubscription(before.subscriptionId);
      return { restored: false, alreadySubscribed: true };
    }

    if (userId) await linkOneSignalUser(userId);

    await OneSignal.User.PushSubscription.optIn();
    const subscribed = await waitForPushSubscription(OneSignal, 12_000);
    if (!subscribed) return { restored: false };

    if (userId) {
      const linkResult = await linkOneSignalUser(userId);
      if (!linkResult.ok) return { restored: false, linkFailed: true };
    }
    await registerDeviceSubscription(readSubscriptionState(OneSignal).subscriptionId);
    return { restored: true };
  } catch {
    return { restored: false };
  }
}

export async function unsubscribeFromPush() {
  const OneSignal = await ensureOneSignal();
  await OneSignal.User.PushSubscription.optOut();
  return { ok: true };
}

export async function syncPushIdentityAndSubscription() {
  if (!isBrowserPushCapable() || !isSupabaseConfigured()) {
    return { ok: false, reason: "unsupported" };
  }

  const userId = await resolveUserId();
  if (!userId) return { ok: false, reason: "no_session" };

  let OneSignal;
  try {
    OneSignal = await ensureOneSignal();
  } catch {
    return { ok: false, reason: "sdk_unavailable" };
  }

  const beforeLinked = readExternalId(OneSignal) === String(userId);
  const pushState = readSubscriptionState(OneSignal);

  // Auto-corrección: re-vincular en cada apertura de sesión si hay suscripción pero external_id no coincide.
  let linkResult = { ok: beforeLinked };
  if (!beforeLinked || pushState.subscribed) {
    linkResult = await linkOneSignalUser(userId);
  }

  if (pushState.subscribed && !linkResult.ok) {
    await delay(800);
    linkResult = await linkOneSignalUser(userId, { retries: 2 });
  }

  await restorePushSubscriptionIfNeeded();
  const state = await getPushStatus();
  if (state.subscribed && state.subscriptionId) {
    await registerDeviceSubscription(state.subscriptionId);
  }
  notifyPushStatusChanged();

  const linked = linkResult.ok || readExternalId(OneSignal) === String(userId);

  return {
    ok: true,
    linked,
    wasLinked: beforeLinked,
    autoCorrected: !beforeLinked && linked,
    subscribed: state.subscribed,
    subscriptionId: state.subscriptionId,
    externalId: readExternalId(OneSignal),
  };
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
  let externalId = null;
  let permission = Notification.permission;

  if (appId) {
    try {
      const OneSignal = await ensureOneSignal();
      const state = readSubscriptionState(OneSignal);
      subscribed = state.subscribed;
      subscriptionId = state.subscriptionId;
      externalId = readExternalId(OneSignal);
      permission = Notification.permission;
    } catch {
      subscribed = false;
    }
  }

  return {
    supported: true,
    subscribed,
    subscriptionId,
    externalId,
    permission,
    pushConfigured: pushConfigured && Boolean(appId),
    needsResync: permission === "granted" && !subscribed,
    needsExternalIdLink: permission === "granted" && subscribed && !externalId,
    provider: "onesignal",
  };
}
