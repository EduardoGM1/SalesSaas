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
  config: () => apiFetch("/notifications/config"),
  status: () => apiFetch("/notifications/status"),
  registerDevice: (subscriptionId) => apiFetch("/notifications/device", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription_id: subscriptionId }),
  }),
};
