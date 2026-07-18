import { notificationsApi } from "@/lib/notifications-api.js";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getInstallPlatform, isIosDevice, isStandaloneApp } from "@/lib/pwa-install.js";
import { reportOneSignalLinkIssue, reportOneSignalPushIssue } from "@/lib/observability.js";
import { PushType, resolvePushPathFromPayload } from "@salesapp/shared/push/notification-targets.js";
import { clearLocalSession } from "@/lib/session-api.js";
/** Page SDK autohosteado (cdn.onesignal.com suele estar bloqueado por adblock/uBlock). */
const SDK_LOCAL_URL = "/onesignal/OneSignalSDK.page.js";
const SDK_CDN_URL = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
const SDK_PAGE_ES6_PATH = "/onesignal/OneSignalSDK.page.es6.js";
/** Ruta relativa desde el origen (sin slash inicial), según docs OneSignal Custom Code. */
const SW_PATH = "onesignal/OneSignalSDKWorker.js";
/** Scope dedicado para no chocar con el SW de la PWA (Workbox en `/`). */
const SW_SCOPE = "/onesignal/";
const SW_URL = `/${SW_PATH}`;
/** Runtime del SDK autohosteado (evita importScripts al CDN bloqueado por extensiones). */
const SW_RUNTIME_PATH = "onesignal/OneSignalSDK.sw.js";
const SW_RUNTIME_URL = `/${SW_RUNTIME_PATH}`;

let initPromise = null;
let sdkReady = null;
let resolvedAppId = null;
let serverConfigured = null;
/** Evita optIn/restore/sync concurrentes (botón + auto-restore). */
let subscribeInFlight = null;
/** Restore silencioso: máximo 1 intento automático por carga de página (desktop). */
let silentRestoreAttempted = false;
/** Último fallo de suscripción (para banner needsResync accionable). */
let lastSubscribeError = null;

function getBuildSafariWebId() {
  return import.meta.env.VITE_ONESIGNAL_SAFARI_WEB_ID || null;
}

function getBuildAppId() {
  return import.meta.env.VITE_ONESIGNAL_APP_ID || null;
}

function loadScript(src, { timeoutMs = 20_000 } = {}) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-onesignal-sdk="1"][src="${src}"]`);
    if (existing?.dataset.onesignalLoaded === "1") {
      resolve();
      return;
    }
    if (existing) existing.remove();

    const script = document.createElement("script");
    script.src = src;
    script.defer = true;
    script.dataset.onesignalSdk = "1";
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (err) {
        script.remove();
        reject(err);
        return;
      }
      script.dataset.onesignalLoaded = "1";
      resolve();
    };
    const timer = window.setTimeout(() => {
      finish(codedError("ONESIGNAL_SDK_LOAD_FAILED", `Timeout loading ${src}`));
    }, timeoutMs);
    script.onload = () => finish(null);
    script.onerror = () => finish(codedError("ONESIGNAL_SDK_LOAD_FAILED", `Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function loadOneSignalPageSdk() {
  // Preferir el ES6 real en mismo origen (el shim CDN solo redirige a este archivo).
  const candidates = [SDK_PAGE_ES6_PATH, SDK_LOCAL_URL, SDK_CDN_URL];
  const errors = [];
  for (const src of candidates) {
    try {
      await loadScript(src);
      console.info("[onesignal] page SDK loaded", src);
      return src;
    } catch (err) {
      errors.push(`${src}: ${err?.detail || err?.message || err}`);
      console.warn("[onesignal] page SDK candidate failed:", src, err?.detail || err?.message || err);
    }
  }
  throw codedError(
    "ONESIGNAL_SDK_LOAD_FAILED",
    `Could not load OneSignal page SDK. ${errors.join(" | ")}`,
  );
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

function registrationScriptUrl(registration) {
  return (
    registration?.active?.scriptURL
    || registration?.waiting?.scriptURL
    || registration?.installing?.scriptURL
    || ""
  );
}

function isOneSignalWorkerScript(scriptURL) {
  return /OneSignalSDKWorker\.js/i.test(String(scriptURL || ""));
}

/**
 * Limpia suscripciones VAPID legacy y registros OneSignal en scope incorrecto (p. ej. `/`).
 * Un SW OneSignal en scope raíz pelea con Workbox (PWA) y en desktop suele acabar en
 * "Failed to register a ServiceWorker" / optIn rechazado.
 */
async function cleanupLegacyWebPushSubscription() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      const scope = registration.scope || "";
      const scriptURL = registrationScriptUrl(registration);
      const onesignalScript = isOneSignalWorkerScript(scriptURL);
      const onesignalScope = scope.includes("/onesignal/");

      // OneSignal fuera de /onesignal/ → conflicto con el SW de la PWA.
      if (onesignalScript && !onesignalScope) {
        console.warn("[onesignal] unregistering conflicting OneSignal SW", { scope, scriptURL });
        await registration.unregister();
        continue;
      }

      if (onesignalScope) continue;

      const sub = await registration.pushManager?.getSubscription();
      if (sub) await sub.unsubscribe();
    }
  } catch (err) {
    console.warn("[onesignal] cleanupLegacyWebPushSubscription:", err);
  }
}

function codedError(code, detail, cause) {
  const mapped = new Error(code);
  mapped.code = code;
  if (detail) mapped.detail = detail;
  if (cause) mapped.cause = cause;
  return mapped;
}

function mapServiceWorkerError(err, code = "SW_REGISTER_FAILED") {
  const name = err?.name || "Error";
  const message = err?.message || String(err || "unknown");
  console.error(`[onesignal] ${code}:`, name, message, err);
  return codedError(code, `${name}: ${message}`, err);
}

async function waitForWorkerActivation(registration, timeoutMs = 8_000) {
  const worker = registration.installing || registration.waiting || registration.active;
  if (!worker || worker.state === "activated") return registration.active || worker;
  await new Promise((resolve) => {
    const done = () => resolve();
    worker.addEventListener("statechange", () => {
      if (worker.state === "activated" || worker.state === "redundant") done();
    });
    window.setTimeout(done, timeoutMs);
  });
  return registration.active || worker;
}

async function waitForPushSubscription(OneSignal, timeoutMs = 25_000) {
  if (readSubscriptionState(OneSignal).subscribed) return true;

  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      OneSignal.User.PushSubscription.removeEventListener("change", onChange);
      clearTimeout(timer);
      clearInterval(poll);
      resolve(value);
    };

    const onChange = () => {
      if (readSubscriptionState(OneSignal).subscribed) finish(true);
    };

    OneSignal.User.PushSubscription.addEventListener("change", onChange);
    // El evento "change" a veces no dispara aunque el token ya exista; sondear.
    const poll = window.setInterval(() => {
      if (readSubscriptionState(OneSignal).subscribed) finish(true);
    }, 400);
    const timer = window.setTimeout(
      () => finish(readSubscriptionState(OneSignal).subscribed),
      timeoutMs,
    );
  });
}

async function readNativePushOnOneSignalSw() {
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_SCOPE);
    const sub = await registration?.pushManager?.getSubscription();
    if (!sub) return { hasNative: false };
    return {
      hasNative: true,
      endpoint: sub.endpoint ? `${String(sub.endpoint).slice(0, 48)}…` : null,
    };
  } catch {
    return { hasNative: false };
  }
}

/** Limpia una suscripción push nativa rota en el SW OneSignal (recovery push service error). */
async function clearNativePushOnOneSignalSw() {
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_SCOPE);
    const sub = await registration?.pushManager?.getSubscription();
    if (sub) {
      console.warn("[onesignal] unsubscribing broken native push on /onesignal/");
      await sub.unsubscribe();
    }
  } catch (err) {
    console.warn("[onesignal] clearNativePushOnOneSignalSw:", err);
  }
}

function isPushServiceFailure(err) {
  const name = err?.name || "";
  const message = err instanceof Error ? err.message : String(err || "");
  return /push service|registration failed|AbortError/i.test(`${name} ${message}`);
}

function rememberSubscribeError(code, detail) {
  lastSubscribeError = { code, detail: detail || null, at: Date.now() };
}

function clearSubscribeError() {
  lastSubscribeError = null;
}

/** Listo para pulsar «Activar»: init resuelto + SW activated en /onesignal/. */
export async function ensurePushRuntimeReady() {
  const OneSignal = await ensureOneSignal();
  const registration = await ensureOneSignalServiceWorkerRegistered();
  const activated = Boolean(registration?.active && registration.active.state === "activated");
  return {
    ready: activated,
    OneSignal,
    registration,
    appId: resolvedAppId,
    onesignalId: OneSignal.User?.onesignalId || null,
  };
}

export async function diagnosePushSubscription() {
  const permission = typeof Notification !== "undefined" ? Notification.permission : "unsupported";
  let sdk = null;
  try {
    sdk = await ensureOneSignal();
  } catch (err) {
    return { permission, error: err?.message || String(err) };
  }
  const state = readSubscriptionState(sdk);
  const native = await readNativePushOnOneSignalSw();
  const registration = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  const diag = {
    permission,
    appId: resolvedAppId,
    origin: typeof window !== "undefined" ? window.location.origin : null,
    onesignalId: sdk.User?.onesignalId || null,
    externalId: readExternalId(sdk),
    ...state,
    nativePush: native,
    sw: {
      scope: registration?.scope || null,
      scriptURL: registrationScriptUrl(registration) || null,
      state: registration?.active?.state || null,
    },
  };
  console.info("[onesignal:diagnose]", diag);
  return diag;
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

async function fetchStaticJs(pathname) {
  const url = `${window.location.origin}${pathname}?preflight=${Date.now()}`;
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
  const okType = contentType.includes("javascript") || contentType.includes("ecmascript") || contentType === "";
  const looksLikeHtml = /<!DOCTYPE html|<html/i.test(text);
  if (!res.ok || looksLikeHtml || (!okType && contentType.includes("html"))) {
    console.warn("[onesignal] static JS preflight failed:", {
      url,
      status: res.status,
      contentType,
      bodyPreview: text.slice(0, 120),
    });
    const mapped = new Error("SW_UNREACHABLE");
    mapped.code = "SW_UNREACHABLE";
    throw mapped;
  }
  return text;
}

/**
 * Comprueba worker + runtime autohosteados (no HTML de la SPA).
 * El entry debe importar ./OneSignalSDK.sw.js (mismo origen), no el CDN.
 */
async function preflightOneSignalServiceWorker() {
  const entry = await fetchStaticJs(SW_URL);
  const hasImport = /importScripts\s*\(\s*["']\.\/OneSignalSDK\.sw\.js["']\s*\)/.test(entry)
    || /importScripts\s*\(\s*["']\/onesignal\/OneSignalSDK\.sw\.js["']\s*\)/.test(entry)
    || /importScripts\s*\(\s*["']https:\/\/cdn\.onesignal\.com\//.test(entry);
  if (!hasImport) {
    console.warn("[onesignal] SW entry missing importScripts:", entry.slice(0, 160));
    const mapped = new Error("SW_UNREACHABLE");
    mapped.code = "SW_UNREACHABLE";
    throw mapped;
  }

  const runtime = await fetchStaticJs(SW_RUNTIME_URL);
  // Runtime minificado del SDK (~40kb); no debe ser HTML ni un stub vacío.
  if (runtime.length < 1000 || !/addEventListener\s*\(\s*["']push["']/.test(runtime)) {
    console.warn("[onesignal] SW runtime looks invalid", { length: runtime.length });
    const mapped = new Error("SW_UNREACHABLE");
    mapped.code = "SW_UNREACHABLE";
    throw mapped;
  }

  return true;
}

/**
 * Prepara el scope OneSignal y espera el registro que hace el SDK (con ?appId=&sdkVersion=).
 * No registramos nosotros con la URL "pelada": eso provoca "script evaluation failed"
 * al pelear con el segundo register() del SDK.
 */
async function ensureOneSignalServiceWorkerRegistered() {
  if (!("serviceWorker" in navigator)) {
    const mapped = new Error("PUSH_UNSUPPORTED");
    mapped.code = "PUSH_UNSUPPORTED";
    throw mapped;
  }

  await cleanupLegacyWebPushSubscription();
  await preflightOneSignalServiceWorker();

  let registration = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  const existingScript = registrationScriptUrl(registration);
  if (registration && existingScript && !/OneSignalSDKWorker\.js/i.test(existingScript)) {
    console.warn("[onesignal] replacing unexpected SW at scope", SW_SCOPE, existingScript);
    await registration.unregister();
    registration = null;
  }

  // Si aún no hay registro, OneSignal.init() debe crearlo. Esperamos un rato.
  const deadline = Date.now() + 12_000;
  while (!registration && Date.now() < deadline) {
    registration = await navigator.serviceWorker.getRegistration(SW_SCOPE);
    if (registration) break;
    await delay(200);
  }

  if (!registration) {
    throw mapServiceWorkerError(
      new Error("OneSignal did not register a service worker at /onesignal/"),
      "SW_REGISTER_FAILED",
    );
  }

  const active = await waitForWorkerActivation(registration);
  if (!active || active.state === "redundant") {
    throw mapServiceWorkerError(
      new Error("Service worker became redundant before activation"),
      "SW_REGISTER_FAILED",
    );
  }

  console.info("[onesignal] SW ready", {
    scope: registration.scope,
    scriptURL: registrationScriptUrl(registration),
    state: registration.active?.state,
  });

  return registration;
}

export async function ensureOneSignal() {
  const appId = await resolveOneSignalAppId();
  if (!appId) {
    throw codedError("ONESIGNAL_NOT_CONFIGURED", "Missing OneSignal appId");
  }
  if (sdkReady) return sdkReady;

  if (!initPromise) {
    initPromise = (async () => {
      // Solo limpieza + preflight; el register lo hace OneSignal.init (URL con appId/sdkVersion).
      try {
        await cleanupLegacyWebPushSubscription();
        await preflightOneSignalServiceWorker();
        await fetchStaticJs(SDK_PAGE_ES6_PATH);
      } catch (err) {
        console.warn("[onesignal] SW/SDK pre-init checks:", err?.detail || err?.message || err);
      }

      // Encolar ANTES de cargar el script (patrón oficial OneSignalDeferred).
      const ready = new Promise((resolve, reject) => {
        let settled = false;
        const timer = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          initPromise = null;
          reject(codedError(
            "ONESIGNAL_SDK_LOAD_FAILED",
            "OneSignalDeferred never invoked after loading page SDK (blocked script or unsupported browser)",
          ));
        }, 25_000);

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
            try {
              await ensureOneSignalServiceWorkerRegistered();
            } catch (swErr) {
              console.warn("[onesignal] post-init SW check:", swErr?.detail || swErr?.message || swErr);
            }
            if (!settled) {
              settled = true;
              window.clearTimeout(timer);
              resolve(OneSignal);
            }
          } catch (err) {
            if (!settled) {
              settled = true;
              window.clearTimeout(timer);
              initPromise = null;
              reject(err);
            }
          }
        });
      });

      await loadOneSignalPageSdk();
      return ready;
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
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
      try {
        event.preventDefault();
      } catch {
        // SDK antiguo sin preventDefault.
      }
      clearLocalSession();
      return;
    }

    // Desktop + app abierta: Realtime → toast es el canal primario (evitar doble nativo/toast).
    if (getInstallPlatform() === "desktop") {
      try {
        event.preventDefault();
      } catch {
        // ignore
      }
      return;
    }

    // Móvil / PWA: notificación nativa del SO.
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

async function subscribeToPushInternal() {
  if (needsIosPwaInstall()) {
    throw codedError("IOS_PWA_REQUIRED");
  }

  if (!isBrowserPushCapable() || !isSupabaseConfigured()) {
    throw codedError("PUSH_UNSUPPORTED", "Browser lacks Notification/ServiceWorker or Supabase is not configured");
  }

  if (Notification.permission === "denied") {
    throw codedError("PERMISSION_DENIED");
  }

  // Pedir permiso ANTES de cualquier await largo: Chrome/Edge exigen gesto de usuario.
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      // reintento vía SDK abajo
    }
  }
  if (Notification.permission === "denied") {
    throw codedError("PERMISSION_DENIED");
  }
  if (Notification.permission !== "granted") {
    throw codedError("PERMISSION_DISMISSED");
  }

  const configured = await resolveServerPushConfigured();
  if (!configured) {
    throw codedError("ONESIGNAL_NOT_CONFIGURED", "Server reports push_configured=false");
  }

  // Flujo lineal: init + SW → optIn → token/id → login → registerDevice.
  // No exigir onesignalId ni logout preventivo antes del optIn.
  const runtime = await ensurePushRuntimeReady();
  const OneSignal = runtime.OneSignal;
  if (!runtime.ready) {
    throw mapServiceWorkerError(
      new Error(`Service worker not activated (state=${runtime.registration?.active?.state || "none"})`),
      "SW_REGISTER_FAILED",
    );
  }

  if (typeof OneSignal.Notifications?.isPushSupported === "function") {
    const supported = await OneSignal.Notifications.isPushSupported();
    if (!supported) {
      throw codedError("PUSH_UNSUPPORTED", "OneSignal.Notifications.isPushSupported() === false");
    }
  }

  const granted = await requestBrowserPermission(OneSignal);
  if (!granted) {
    throw codedError(
      Notification.permission === "denied" ? "PERMISSION_DENIED" : "PERMISSION_DISMISSED",
    );
  }

  const userId = await resolveUserId();
  const already = readSubscriptionState(OneSignal);
  if (already.subscribed) {
    clearSubscribeError();
    if (userId) await linkOneSignalUser(userId);
    await registerDeviceSubscription(already.subscriptionId);
    return already;
  }

  const runOptIn = async () => {
    await OneSignal.User.PushSubscription.optIn();
  };

  try {
    await runOptIn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[onesignal] optIn failed:", message, err);
    void reportOneSignalPushIssue({
      stage: "optIn",
      code: "OPT_IN_THREW",
      detail: message,
      permission: Notification.permission,
      error: err instanceof Error ? err : new Error(message),
      message: `OneSignal optIn threw: ${message}`,
    });

    if (/service worker|failed to register|bad HTTP|unsupported MIME|redirect|SecurityError/i.test(message)) {
      try {
        await cleanupLegacyWebPushSubscription();
        await ensureOneSignalServiceWorkerRegistered();
        await runOptIn();
      } catch (retryErr) {
        rememberSubscribeError("SW_REGISTER_FAILED", retryErr?.detail || retryErr?.message || message);
        throw mapServiceWorkerError(retryErr || err, "SW_REGISTER_FAILED");
      }
    } else if (isPushServiceFailure(err) || /NotAllowedError|missing onesignalId/i.test(message)) {
      // Recovery puntual: limpiar push nativo roto y un solo reintento.
      try {
        await clearNativePushOnOneSignalSw();
        await cleanupLegacyWebPushSubscription();
        await ensureOneSignalServiceWorkerRegistered();
        // Solo si hay external_id sin push: logout para desbloquear el modelo del SDK.
        if (readExternalId(OneSignal) && !readSubscriptionState(OneSignal).subscribed) {
          try {
            await OneSignal.logout();
          } catch {
            // ignore
          }
        }
        await delay(400);
        await runOptIn();
      } catch (retryErr) {
        rememberSubscribeError("PUSH_SERVICE_ERROR", retryErr?.message || message);
        throw mapServiceWorkerError(retryErr || err, "PUSH_SERVICE_ERROR");
      }
    } else {
      rememberSubscribeError("PUSH_SERVICE_ERROR", message);
      throw codedError("PUSH_SERVICE_ERROR", message, err);
    }
  }

  let subscribed = await waitForPushSubscription(OneSignal, 25_000);

  if (!subscribed) {
    console.warn("[onesignal] optIn produced no subscription; one recovery via clear+optIn");
    try {
      await clearNativePushOnOneSignalSw();
      try {
        await OneSignal.User.PushSubscription.optOut();
      } catch {
        // ignore
      }
      await delay(500);
      await runOptIn();
      subscribed = await waitForPushSubscription(OneSignal, 20_000);
    } catch (retryErr) {
      console.warn("[onesignal] push recovery retry failed:", retryErr);
    }
  }

  if (!subscribed) {
    const state = readSubscriptionState(OneSignal);
    const native = await readNativePushOnOneSignalSw();
    const detail = `Chrome/FCM push service did not yield a subscription (optedIn=${state.optedIn}, id=${state.subscriptionId}, token=${Boolean(state.token)}, nativePush=${native.hasNative}, onesignalId=${OneSignal.User?.onesignalId || null}, origin=${window.location.origin}, appId=${resolvedAppId}). Check OneSignal Site URL and Identity Verification.`;
    rememberSubscribeError("PUSH_SERVICE_ERROR", detail);
    void reportOneSignalPushIssue({
      stage: "waitForPushSubscription",
      code: "PUSH_SERVICE_ERROR",
      detail,
      permission: Notification.permission,
      optedIn: state.optedIn,
      subscriptionId: state.subscriptionId,
      hasToken: Boolean(state.token),
      message: "Push subscription missing after optIn (push service error)",
    });
    console.error("[onesignal] subscription missing after optIn", { state, native, appId: resolvedAppId });
    throw codedError("PUSH_SERVICE_ERROR", detail);
  }

  clearSubscribeError();

  if (userId) {
    const linkResult = await linkOneSignalUser(userId);
    if (!linkResult.ok) {
      console.warn("[onesignal] subscription ok but external_id link failed:", linkResult.error);
      void reportOneSignalLinkIssue({
        stage: "subscribeToPush:postOptInLink",
        userId,
        externalId: readExternalId(OneSignal),
        onesignalId: OneSignal.User.onesignalId || null,
        subscriptionId: readSubscriptionState(OneSignal).subscriptionId,
        subscribed: true,
        error: linkResult.error,
        message: linkResult.error?.message || "login/external_id verify failed after optIn",
      });
    }
  }

  await registerDeviceSubscription(readSubscriptionState(OneSignal).subscriptionId);
  return readSubscriptionState(OneSignal);
}

export async function subscribeToPush() {
  if (subscribeInFlight) return subscribeInFlight;
  subscribeInFlight = subscribeToPushInternal().finally(() => {
    subscribeInFlight = null;
  });
  return subscribeInFlight;
}

/**
 * @param {{ force?: boolean }} [opts] force=true ignora el límite de 1 restore/sesión (botón Activar).
 */
export async function restorePushSubscriptionIfNeeded({ force = false } = {}) {
  if (!isBrowserPushCapable() || !isSupabaseConfigured()) return { restored: false };
  if (Notification.permission !== "granted") return { restored: false };

  if (!force && silentRestoreAttempted) {
    return { restored: false, skipped: true, reason: "already_attempted" };
  }
  if (!force) silentRestoreAttempted = true;

  const configured = await resolveServerPushConfigured();
  if (!configured) return { restored: false };

  try {
    if (subscribeInFlight) {
      try {
        await subscribeInFlight;
        return { restored: true };
      } catch {
        return { restored: false };
      }
    }

    const OneSignal = await ensureOneSignal();
    const before = readSubscriptionState(OneSignal);
    if (before.subscribed) {
      const userId = await resolveUserId();
      if (userId) await linkOneSignalUser(userId);
      await registerDeviceSubscription(before.subscriptionId);
      clearSubscribeError();
      return { restored: false, alreadySubscribed: true };
    }

    await subscribeToPush();
    return { restored: true };
  } catch (err) {
    console.warn("[onesignal] restorePushSubscriptionIfNeeded:", err?.detail || err?.message || err);
    return { restored: false, error: err?.code || err?.message || "unknown" };
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

  // Compartir mutex con subscribe/restore para no spamear SW ready / optIn.
  if (subscribeInFlight) {
    try {
      await subscribeInFlight;
    } catch {
      // ignore
    }
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

  // Solo vincular si ya hay suscripción. El restore automático lo hace el provider 1×/sesión.
  let linkResult = { ok: beforeLinked };
  if (pushState.subscribed) {
    linkResult = await linkOneSignalUser(userId);
    if (!linkResult.ok) {
      await delay(800);
      linkResult = await linkOneSignalUser(userId, { retries: 2 });
    }
  }

  const state = await getPushStatus();
  if (state.subscribed && state.subscriptionId) {
    await registerDeviceSubscription(state.subscriptionId);
  }
  notifyPushStatusChanged();

  const linked = Boolean(state.subscribed)
    && (linkResult.ok || readExternalId(OneSignal) === String(userId));

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

  const pushServiceFailed = Boolean(
    lastSubscribeError?.code === "PUSH_SERVICE_ERROR" && permission === "granted" && !subscribed,
  );

  return {
    supported: true,
    subscribed,
    subscriptionId,
    externalId,
    permission,
    pushConfigured: pushConfigured && Boolean(appId),
    needsResync: permission === "granted" && !subscribed,
    pushServiceFailed,
    lastSubscribeError: lastSubscribeError ? { ...lastSubscribeError } : null,
    needsExternalIdLink: permission === "granted" && subscribed && !externalId,
    provider: "onesignal",
  };
}
