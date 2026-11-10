import { normalizeIds } from "@/lib/data/mappers";
import { omitDeniedToolWrites } from "@/lib/tool-write-denial.js";
import { applyBlockedStrip } from "./sync-outbox.js";

export const SYNC_PROTOCOL = "2";

export async function pullViaApi() {
  const res = await fetch("/api/v1/sync", {
    credentials: "include",
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || "Error al descargar sync.");
    err.status = res.status;
    err.code = body.code || null;
    throw err;
  }
  return body.data;
}

/**
 * PUT /sync con protocolo 2.
 * @returns {Promise<{ data: object, partial: boolean, rejected: Array }>}
 */
export async function reconcileViaApi(db) {
  const stripped = applyBlockedStrip(omitDeniedToolWrites(db));
  const { db: norm, changed } = normalizeIds(stripped);
  const res = await fetch("/api/v1/sync", {
    method: "PUT",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Sync-Protocol": SYNC_PROTOCOL,
    },
    body: JSON.stringify({ data: norm }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || "Error al subir sync.");
    err.status = res.status;
    err.code = body.code || null;
    err.rejected = Array.isArray(body.rejected) ? body.rejected : [];
    throw err;
  }
  return {
    data: body.data,
    partial: body.partial === true,
    rejected: Array.isArray(body.rejected) ? body.rejected : [],
    /** @deprecated solo diagnóstico */
    normalizedChanged: !!changed,
  };
}
