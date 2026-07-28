export async function adminJson(path, { method = "GET", body, signal } = {}) {
  const response = await fetch(`/api/v1/admin/${path}`, {
    method,
    credentials: "include",
    signal,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "No fue posible completar la operación");
  }
  return payload.data ?? payload;
}
