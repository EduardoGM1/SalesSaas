async function participantsJson(path, { method = "GET", body } = {}) {
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

export const participantsApi = {
  get: (prospectId) => participantsJson(`prospects/${prospectId}/participants`),
  active: () => participantsJson("prospects/active"),
  assignCloser: (prospectId, cerradorId) => participantsJson(
    `prospects/${prospectId}/participants/assign-closer`,
    { method: "POST", body: { cerrador_id: cerradorId } },
  ),
  assignRepresentante: (prospectId, representanteId) => participantsJson(
    `prospects/${prospectId}/participants/assign-representante`,
    { method: "POST", body: { representante_id: representanteId } },
  ),
  openChat: (prospectId) => participantsJson(`prospects/${prospectId}/chat`, { method: "POST" }),
};
