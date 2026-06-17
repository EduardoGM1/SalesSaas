async function apiFetch(path, options = {}) {
  const res = await fetch(`/api/v1${path}`, {
    credentials: "include",
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Error de red.");
  return body.data ?? body;
}

export const notificationsApi = {
  vapidPublicKey: () => apiFetch("/notifications/vapid-public-key"),
  status: () => apiFetch("/notifications/status"),
  subscribe: (subscription) => apiFetch("/notifications/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription),
  }),
  unsubscribe: (endpoint) => apiFetch("/notifications/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  }),
};
