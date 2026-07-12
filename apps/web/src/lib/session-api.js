import { isSupabaseConfigured } from "@/lib/supabase/config";
import { markPresenceOffline } from "@/lib/presence-api.js";
import { clearAdminSessionCache } from "@/hooks/use-admin-session.js";
import { createClient, primeRealtimeAuth } from "@/lib/supabase/client";
import { isStandaloneApp } from "@/lib/pwa-install.js";

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

export async function fetchSession() {
  if (!isSupabaseConfigured()) return null;
  const res = await fetch("/api/v1/auth/session", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
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
  try {
    localStorage.setItem(AUTH_SYNC_KEY, String(Date.now()));
  } catch {
    // private mode / storage blocked
  }
  window.dispatchEvent(new Event("auth:changed"));
}

/**
 * Limpia sesión solo en este dispositivo (tras revoke global en servidor).
 * Usado por Realtime Broadcast, postgres_changes, push y guards locales.
 * @param {{ notify?: boolean }} [options]
 */
export async function clearLocalSession(options = {}) {
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
  if (notify) notifyAuthChanged();
}

export async function signOut() {
  ensureAuthSyncBridge();
  try {
    markPresenceOffline();
  } catch {
    // ignore
  }

  // 1) Avisar a otros dispositivos EN TIEMPO REAL (antes de perder auth en Realtime).
  try {
    const sync = await import("@/lib/session-cross-device.js");
    await sync.broadcastRemoteSignedOut();
  } catch {
    // ignore — auth_revoked_at + push siguen como respaldo
  }

  // 2) Revocar en servidor (auth_revoked_at + refresh tokens + push).
  try {
    await fetch("/auth/signout", { method: "POST", credentials: "include", cache: "no-store" });
  } catch {
    // Limpiar estado local aunque falle la red.
  }

  // 3) Cerrar canal local y sesión del browser client.
  try {
    const sync = await import("@/lib/session-cross-device.js");
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
  notifyAuthChanged();
}

/**
 * @param {(session: object | null) => void} onSession
 * @param {{ intervalMs?: number }} [options]
 */
export function watchSession(onSession, { intervalMs } = {}) {
  ensureAuthSyncBridge();
  const standalone = typeof window !== "undefined" && isStandaloneApp();
  // Poll de respaldo: Realtime avisa al instante; esto cubre si el canal falla.
  const pollMs = intervalMs ?? (standalone ? 8000 : 15000);
  let active = true;
  let inFlight = false;
  let pending = false;

  const load = async ({ retry = false } = {}) => {
    if (!active) return;
    if (inFlight) {
      pending = true;
      return;
    }
    inFlight = true;
    try {
      const session = await fetchSession();
      if (active) onSession(session);
    } catch {
      // Error de red al despertar: reintentar una vez; no marcar logout por fallo temporal.
      if (retry && active) {
        await delay(900);
        try {
          const session = await fetchSession();
          if (active) onSession(session);
        } catch {
          // Mantener estado previo.
        }
      }
    } finally {
      inFlight = false;
      if (pending && active) {
        pending = false;
        load({ retry: true });
      }
    }
  };

  load({ retry: true });
  const interval = setInterval(() => {
    if (document.visibilityState === "visible") load({ retry: true });
  }, pollMs);

  const onVisible = () => {
    if (document.visibilityState === "visible") load({ retry: true });
  };
  const onResume = () => load({ retry: true });

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onResume);
  window.addEventListener("pageshow", onResume);
  window.addEventListener("auth:changed", onResume);
  window.addEventListener("auth:resume", onResume);

  return () => {
    active = false;
    clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onResume);
    window.removeEventListener("pageshow", onResume);
    window.removeEventListener("auth:changed", onResume);
    window.removeEventListener("auth:resume", onResume);
  };
}
