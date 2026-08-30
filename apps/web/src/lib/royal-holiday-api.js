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

function qs(params = {}) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== "") sp.set(k, v);
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const royalHolidayApi = {
  getCatalogo: (empresaId) => apiFetch(`/royal-holiday/${empresaId}/catalogo`),
  preview: (empresaId, body) =>
    apiFetch(`/royal-holiday/${empresaId}/preview`, { method: "POST", body: JSON.stringify(body) }),
  saveVenta: (empresaId, body) =>
    apiFetch(`/royal-holiday/${empresaId}/ventas`, { method: "POST", body: JSON.stringify(body) }),
  listComisiones: (empresaId, params) =>
    apiFetch(`/royal-holiday/${empresaId}/comisiones-movimientos${qs(params)}`),
  listDiasDescanso: (empresaId, params) =>
    apiFetch(`/royal-holiday/${empresaId}/dias-descanso${qs(params)}`),
  saveDiaDescanso: (empresaId, body) =>
    apiFetch(`/royal-holiday/${empresaId}/dias-descanso`, { method: "POST", body: JSON.stringify(body) }),
  deleteDiaDescanso: (empresaId, id) =>
    apiFetch(`/royal-holiday/${empresaId}/dias-descanso/${id}`, { method: "DELETE" }),
  getOpsConfig: (empresaId) => apiFetch(`/royal-holiday/${empresaId}/ops-config`),
  saveOpsConfig: (empresaId, config) =>
    apiFetch(`/royal-holiday/${empresaId}/ops-config`, { method: "PUT", body: JSON.stringify({ config }) }),
  getMoneyBoxConfig: (empresaId) => apiFetch(`/royal-holiday/${empresaId}/money-box-config`),
  saveMoneyBoxRestrictions: (empresaId, restrictions) =>
    apiFetch(`/royal-holiday/${empresaId}/money-box-config`, {
      method: "PUT",
      body: JSON.stringify({ restrictions }),
    }),
  listPremanifiesto: (empresaId, params) =>
    apiFetch(`/royal-holiday/${empresaId}/premanifiesto${qs(params)}`),
  getPremanifiestoDia: (empresaId, params) =>
    apiFetch(`/royal-holiday/${empresaId}/premanifiesto/dia${qs(params)}`),
  getPremanifiestoCupos: (empresaId, params) =>
    apiFetch(`/royal-holiday/${empresaId}/premanifiesto/cupos${qs(params)}`),
  registrarPremanifiestoPareja: (empresaId, body) =>
    apiFetch(`/royal-holiday/${empresaId}/premanifiesto/registrar`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  tomarCasoPremanifiesto: (empresaId, rowId, body) =>
    apiFetch(`/royal-holiday/${empresaId}/premanifiesto/${rowId}/tomar-caso`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  actualizarPremanifiesto: (empresaId, rowId, body) =>
    apiFetch(`/royal-holiday/${empresaId}/premanifiesto/${rowId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  savePremanifiesto: (empresaId, body) =>
    apiFetch(`/royal-holiday/${empresaId}/premanifiesto`, { method: "POST", body: JSON.stringify(body) }),
  listAsignacion: (empresaId, params) =>
    apiFetch(`/royal-holiday/${empresaId}/linea/asignacion${qs(params)}`),
  saveAsignacion: (empresaId, body) =>
    apiFetch(`/royal-holiday/${empresaId}/linea/asignacion`, { method: "POST", body: JSON.stringify(body) }),
  listRotacion: (empresaId, params) =>
    apiFetch(`/royal-holiday/${empresaId}/linea/rotacion${qs(params)}`),
  saveRotacion: (empresaId, body) =>
    apiFetch(`/royal-holiday/${empresaId}/linea/rotacion`, { method: "POST", body: JSON.stringify(body) }),
  listPropinas: (empresaId, params) =>
    apiFetch(`/royal-holiday/${empresaId}/propinas${qs(params)}`),
  savePropina: (empresaId, body) =>
    apiFetch(`/royal-holiday/${empresaId}/propinas`, { method: "POST", body: JSON.stringify(body) }),
  listOkr: (empresaId, params) =>
    apiFetch(`/royal-holiday/${empresaId}/okr${qs(params)}`),
  saveOkr: (empresaId, body) =>
    apiFetch(`/royal-holiday/${empresaId}/okr`, { method: "POST", body: JSON.stringify(body) }),
  resumen: (empresaId, params) =>
    apiFetch(`/royal-holiday/${empresaId}/resumen${qs(params)}`),
};
