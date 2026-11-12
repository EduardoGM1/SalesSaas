/** @type {Promise<object | null> | null} */
let realtimeSessionInflight = null;

/**
 * Tokens para Realtime. 401 → null (sin throw): el caller decide no suscribirse.
 * Single-flight para no martillar getSession/refresh en el API.
 */
export async function fetchRealtimeSession() {
  if (realtimeSessionInflight) return realtimeSessionInflight;

  realtimeSessionInflight = (async () => {
    const res = await fetch("/api/v1/auth/realtime-session", {
      credentials: "include",
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) return null;
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Error de red.");
    return body.data ?? body;
  })().finally(() => {
    realtimeSessionInflight = null;
  });

  return realtimeSessionInflight;
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
