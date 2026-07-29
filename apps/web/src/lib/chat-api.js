/**
 * API de chat grupal por expediente (Chat de equipo).
 */
async function chatJson(path, { method = "GET", body } = {}) {
  const response = await fetch(`/api/v1/${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "No fue posible completar la acción.");
    error.status = response.status;
    throw error;
  }
  return payload.data ?? payload;
}

export const chatApi = {
  list: () => chatJson("chat/conversations"),
  get: (id) => chatJson(`chat/conversations/${id}`),
  messages: (id) => chatJson(`chat/conversations/${id}/messages`),
  send: (id, body) => chatJson(`chat/conversations/${id}/messages`, { method: "POST", body }),
};
