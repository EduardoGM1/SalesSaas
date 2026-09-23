import { isSupabaseConfigured } from "@/lib/supabase/config";
import { markPresenceOffline } from "@/lib/presence-api.js";
import { clearAdminSessionCache } from "@/hooks/use-admin-session.js";
import { clearUserPlanCache } from "@/lib/user-plan-cache.js";
import { createClient, primeRealtimeAuth } from "@/lib/supabase/client";
import { isStandaloneApp } from "@/lib/pwa-install.js";
import { resetLocalUserState } from "@/lib/local-session-reset.js";
import { requestSyncPush } from "@/lib/sync-outbound.js";
import { isOutboxDirty } from "@/lib/sync-outbox.js";

/** Tiempo máximo para intentar subir cambios pendientes antes de borrar el estado local. */
const SIGNOUT_FLUSH_TIMEOUT_MS = 4000;

/** Clave localStorage para propagar login/logout entre pestaña web y PWA (mismo origen). */
const AUTH_SYNC_KEY = "sts4_auth_sync";

let authSyncReady = false;
let resumeProbeReady = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Escucha cambios de auth en otras ventanas (browser ↔ PWA standalone). */
export function ensureAuthSyncBridge() {
  if (authSyncReady || typeof window === "undefined") return;
  authSyncReady = true;
  window.addEventListener("storage", (event) => {
    if (event.key === AUTH_SYNC_KEY && event.newValue) {
      window.dispatchEvent(new Event("auth:changed"));
    }
  });
}

/**
 * En PWA/móvil: al volver a abrir la app fuerza revalidación de sesión
 * (visibility + pageshow + focus, con un segundo intento cuando despierta la red).
 */
export function initSessionResumeProbe() {
  if (resumeProbeReady || typeof window === "undefined") return;
  resumeProbeReady = true;
  ensureAuthSyncBridge();

  let debounceTimer = null;
  const signalResume = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      window.dispatchEvent(new Event("auth:resume"));
      // Segundo intento: iOS/Android a menudo tardan en tener red al salir de background.
      setTimeout(() => window.dispatchEvent(new Event("auth:resume")), 1200);
    }, 40);
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") signalResume();
  });
  window.addEventListener("pageshow", (event) => {
    // bfcache o PWA standalone: siempre revalidar al mostrar la página.
    if (event.persisted || isStandaloneApp()) signalResume();
  });
  window.addEventListener("focus", () => {
    if (isStandaloneApp()) signalResume();
  });
}

/** Última sesión conocida. `undefined` = todavía no hay valor. */
let cachedSession;
/** @type {number} Sube en cada invalidación para ignorar respuestas viejas. */
let sessionGeneration = 0;
/** @type {{ gen: number, promise: Promise<object | null> } | null} */
let sessionInflight = null;
/** @type {Set<(session: object | null) => void>} */
const sessionListeners = new Set();
let sessionBusReady = false;

function publishSession(session) {
  cachedSession = session;
  for (const listener of sessionListeners) {
    try {
      listener(session);
    } catch {
      // Un suscriptor no debe tumbar al resto.
    }
  }
}

/** Tira la sesión en memoria. La petición en vuelo, si la hay, ya no se publica. */
export function invalidateSessionCache() {
  sessionGeneration += 1;
  cachedSession = undefined;
}

async function loadSessionFromNetwork(gen) {
  const res = await fetch("/api/v1/auth/session", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Una sola sesión para todos los hooks.
 * Las llamadas concurrentes comparten la promesa. Sin `force`, se reusa el
 * último valor. `force` va a red (logout, switch, poll) y sigue coalesciendo.
 * @param {{ force?: boolean }} [options]
 */
export async function fetchSession({ force = false } = {}) {
  if (!isSupabaseConfigured()) return null;
  if (!force && cachedSession !== undefined) return cachedSession;
  if (sessionInflight && sessionInflight.gen === sessionGeneration) return sessionInflight.promise;

  const gen = sessionGeneration;
  const promise = (async () => {
    try {
      const data = await loadSessionFromNetwork(gen);
      if (gen === sessionGeneration) publishSession(data);
      return data;
    } catch {
      await delay(900);
      try {
        const data = await loadSessionFromNetwork(gen);
        if (gen === sessionGeneration) publishSession(data);
        return data;
      } catch {
        return cachedSession === undefined ? null : cachedSession;
      }
    } finally {
      if (sessionInflight && sessionInflight.gen === gen) sessionInflight = null;
    }
  })();

  sessionInflight = { gen, promise };
  return promise;
}

function ensureSessionBus() {
  if (sessionBusReady || typeof window === "undefined") return;
  sessionBusReady = true;
  ensureAuthSyncBridge();
  const pollMs = isStandaloneApp() ? 3000 : 4000;
  const refresh = () => {
    if (document.visibilityState === "visible") void fetchSession({ force: true });
  };
  setInterval(refresh, pollMs);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
  });
  window.addEventListener("auth:resume", () => {
    invalidateSessionCache();
    void fetchSession({ force: true });
  });
}

export async function fetchProfile() {
  if (!isSupabaseConfigured()) return null;
  const res = await fetch("/api/v1/profile", { credentials: "include", cache: "no-store" });
  if (!res.ok) return null;
  const body = await res.json().catch(() => ({}));
  return body.data ?? null;
}

export function notifyAuthChanged() {
  if (typeof window === "undefined") return;
  ensureAuthSyncBridge();
  invalidateSessionCache();
  try {
    localStorage.setItem(AUTH_SYNC_KEY, String(Date.now()));
  } catch {
    // private mode / storage blocked
  }
  window.dispatchEvent(new Event("auth:changed"));
  void fetchSession({ force: true });
}

/**
 * Limpia sesión solo en este dispositivo (tras revoke global en servidor).
 * Usado por Realtime Broadcast, postgres_changes, push y guards locales.
 * @param {{ notify?: boolean }} [options]
 */
export async function clearLocalSession(options = {}) {
  invalidateSessionCache();
  const notify = options.notify !== false;
  try {
    const sync = await import("@/lib/session-cross-device.js");
    await sync.detachSessionSync();
  } catch {
    // ignore
  }
  try {
    await createClient().auth.signOut({ scope: "local" });
  } catch {
    // ignore
  }
  primeRealtimeAuth(null);
  clearAdminSessionCache();
  clearUserPlanCache();
  await resetLocalUserState();
  if (notify) notifyAuthChanged();
}

/** Best-effort: subir mutaciones pendientes antes de borrar el blob local. */
async function flushOutboxBeforeSignOut() {
  if (!isOutboxDirty()) return;
  try {
    await Promise.race([
      requestSyncPush({ reason: "signout" }),
      delay(SIGNOUT_FLUSH_TIMEOUT_MS),
    ]);
  } catch {
    // Sin red: se pierde lo no sincronizado; preferible a filtrarlo al siguiente usuario.
  }
}

export async function signOut() {
  invalidateSessionCache();
  ensureAuthSyncBridge();
  const t0 = Date.now();
  try {
    markPresenceOffline();
  } catch {
    // ignore
  }

  await flushOutboxBeforeSignOut();

  const syncMod = import("@/lib/session-cross-device.js");

  // Broadcast + revoke en PARALELO (no esperar Auth antes de avisar a otros).
  const broadcastP = syncMod
    .then((sync) => sync.broadcastRemoteSignedOut())
    .catch(() => ({ ok: false }));

  const serverP = fetch("/auth/signout", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
  }).catch(() => null);

  await Promise.all([broadcastP, serverP]);
  if (import.meta.env.DEV) console.info(`[session-sync] +${Date.now() - t0}ms signOut:broadcast+server`);

  try {
    const sync = await syncMod;
    await sync.detachSessionSync();
  } catch {
    // ignore
  }
  try {
    await createClient().auth.signOut({ scope: "global" });
  } catch {
    // ignore
  }
  primeRealtimeAuth(null);
  clearAdminSessionCache();
  clearUserPlanCache();
  await resetLocalUserState();
  notifyAuthChanged();
  if (import.meta.env.DEV) console.info(`[session-sync] +${Date.now() - t0}ms signOut:done`);
}

/**
 * @param {(session: object | null) => void} onSession
 * @param {{ intervalMs?: number }} [options]
 */
export function watchSession(onSession) {
  ensureSessionBus();
  sessionListeners.add(onSession);
  if (cachedSession !== undefined) onSession(cachedSession);
  else void fetchSession();
  return () => {
    sessionListeners.delete(onSession);
  };
}
