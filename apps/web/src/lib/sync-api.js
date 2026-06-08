import { normalizeIds } from "@/lib/data/mappers";

export async function pullViaApi() {
  const res = await fetch("/api/v1/sync", { credentials: "include" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Error al descargar sync.");
  return body.data;
}

export async function reconcileViaApi(db) {
  const { db: norm } = normalizeIds(db);
  const res = await fetch("/api/v1/sync", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: norm }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Error al subir sync.");
  return body.data;
}
