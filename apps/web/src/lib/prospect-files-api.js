/**
 * API de archivos del expediente (REST).
 */
async function filesJson(path, { method = "GET", body } = {}) {
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

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

export const prospectFilesApi = {
  list: (prospectId) => filesJson(`prospects/${prospectId}/files`),
  upload: async (prospectId, file) => {
    const dataUrl = await fileToDataUrl(file);
    return filesJson(`prospects/${prospectId}/files`, {
      method: "POST",
      body: { nombre: file.name, data_url: dataUrl },
    });
  },
  remove: (prospectId, fileId) => filesJson(`prospects/${prospectId}/files/${fileId}`, { method: "DELETE" }),
};
