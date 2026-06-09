import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function fetchSession() {
  if (!isSupabaseConfigured()) return { user, profile: null };
  const res = await fetch("/api/v1/auth/session", { credentials: "include" });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchProfile() {
  if (!isSupabaseConfigured()) return null;
  const res = await fetch("/api/v1/profile", { credentials: "include" });
  if (!res.ok) return null;
  const body = await res.json().catch(() => ({}));
  return body.data ?? null;
}

export function notifyAuthChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("auth:changed"));
}

export function watchSession(onSession, { intervalMs = 60000 } = {}) {
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
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("auth:changed", load);
  return () => {
    active = false;
    clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("auth:changed", load);
  };
}
