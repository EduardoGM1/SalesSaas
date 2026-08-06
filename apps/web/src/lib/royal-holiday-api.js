async function apiFetch(path, options = {}) {
  const res = await fetch(`/api/v1${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || json.message || `Error ${res.status}`);
  return json.data ?? json;
}

export const royalHolidayApi = {
  getCatalogo: (empresaId) => apiFetch(`/royal-holiday/${empresaId}/catalogo`),
  preview: (empresaId, body) =>
    apiFetch(`/royal-holiday/${empresaId}/preview`, { method: "POST", body: JSON.stringify(body) }),
  saveVenta: (empresaId, body) =>
    apiFetch(`/royal-holiday/${empresaId}/ventas`, { method: "POST", body: JSON.stringify(body) }),
};
