async function apiFetch(path, options = {}) {
  const res = await fetch(`/api/v1${path}`, {
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error || body?.message || `Error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body.data ?? body;
}

export const customModulesApi = {
  listEnabled: (punto) =>
    apiFetch(`/custom-modules${punto ? `?punto=${encodeURIComponent(punto)}` : ""}`),
  getDatos: (moduloId, entidadId) =>
    apiFetch(`/custom-modules/${moduloId}/datos?entidad_id=${encodeURIComponent(entidadId)}`),
  saveDatos: (moduloId, entidadId, datos) =>
    apiFetch(`/custom-modules/${moduloId}/datos`, {
      method: "PUT",
      body: JSON.stringify({ entidad_relacionada_id: entidadId, datos }),
    }),
};
