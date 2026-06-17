async function apiFetch(path, options = {}) {
  const res = await fetch(`/api/v1${path}`, {
    credentials: "include",
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Error de red.");
  return body.data ?? body;
}

export async function fetchRealtimeSession() {
  return apiFetch("/auth/realtime-session");
}

export function markPresenceOffline() {
  try {
    fetch("/api/v1/profile/presence/offline", {
      method: "POST",
      credentials: "include",
      keepalive: true,
    });
  } catch {
    // Sin bloquear cierre de pestaña.
  }
}
