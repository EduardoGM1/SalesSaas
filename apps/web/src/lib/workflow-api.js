async function workflowJson(path, { method = "GET", body } = {}) {
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

export const workflowApi = {
  get: (prospectId) => workflowJson(`prospects/${prospectId}/workflow`),
  inbox: () => workflowJson("workflow/inbox"),
  advance: (prospectId, body = {}) => workflowJson(`prospects/${prospectId}/workflow/advance`, { method: "POST", body }),
  sendReview: (prospectId, body = {}) => workflowJson(`prospects/${prospectId}/workflow/send-review`, { method: "POST", body }),
  review: (prospectId, decision, comentario = "") => workflowJson(`prospects/${prospectId}/workflow/review`, { method: "POST", body: { decision, comentario } }),
  assignCloser: (prospectId, cerradorId) => workflowJson(`prospects/${prospectId}/workflow/assign-closer`, { method: "POST", body: { cerrador_id: cerradorId } }),
};
