import { isSupabaseConfigured } from "@/lib/supabase/config";
import { markPresenceOffline } from "@/lib/presence-api.js";
import { clearAdminSessionCache } from "@/hooks/use-admin-session.js";
import { createClient, primeRealtimeAuth } from "@/lib/supabase/client";

/** Clave localStorage para propagar login/logout entre pestaña web y PWA (mismo origen). */
const AUTH_SYNC_KEY = "sts4_auth_sync";

let authSyncReady = false;

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

export async function signOut() {
  ensureAuthSyncBridge();
  try {
    markPresenceOffline();
    await fetch("/auth/signout", { method: "POST", credentials: "include", cache: "no-store" });
  } catch {
    // Limpiar estado local aunque falle la red.
  }
  try {
    // Revoca refresh tokens y limpia cookies/sesión del cliente browser (Realtime, OneSignal).
    await createClient().auth.signOut({ scope: "global" });
  } catch {
    // ignore
  }
  primeRealtimeAuth(null);
  clearAdminSessionCache();
  notifyAuthChanged();
}

export function watchSession(onSession, { intervalMs = 60000 } = {}) {
  ensureAuthSyncBridge();
  let active = true;
  const load = async () => {
    const session = await fetchSession();
    if (active) onSession(session);
  };
  load();
  const interval = setInterval(load, intervalMs);
  const onVisible = () => {
    if (document.visibilityState === "visible") load();
  };
  const onFocus = () => load();
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onFocus);
  window.addEventListener("pageshow", onFocus);
  window.addEventListener("auth:changed", load);
  return () => {
    active = false;
    clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("pageshow", onFocus);
    window.removeEventListener("auth:changed", load);
  };
}
