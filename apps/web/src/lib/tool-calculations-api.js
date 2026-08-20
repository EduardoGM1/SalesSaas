/**
 * Carga on-demand del JSON de una herramienta (no viaja en /sync).
 */
const inflight = new Map();

export const TOOL_META_KEYS = new Set(["_updatedAt", "_id", "_pending", "_stale"]);

export function isToolMetaStub(bucket) {
  if (!bucket || typeof bucket !== "object") return false;
  if (bucket._pending || bucket._stale) return true;
  return Object.keys(bucket).every((k) => k.startsWith("_"));
}

export function stripToolMeta(bucket) {
  if (!bucket || typeof bucket !== "object") return {};
  const out = { ...bucket };
  for (const k of Object.keys(out)) {
    if (k.startsWith("_")) delete out[k];
  }
  return out;
}

function peekRawBucket(db, tool, mode, clientId) {
  if (mode === "client" && clientId) {
    return db.clients?.[clientId]?.data?.[tool] || null;
  }
  return db.libre?.[tool] || null;
}

export async function fetchToolCalculation({ id, tool, prospectId } = {}) {
  let url = "";
  if (id) {
    url = `/api/v1/tool-calculations/${encodeURIComponent(id)}`;
  } else if (tool) {
    const qs = new URLSearchParams({ tool });
    if (prospectId) qs.set("prospect_id", prospectId);
    url = `/api/v1/tool-calculations?${qs}`;
  } else {
    throw new Error("id o tool requerido.");
  }
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body.data ?? null;
}

/**
 * Si el store solo tiene metadata de sync, pide el JSON y lo guarda sin re-subir.
 * @returns {Promise<boolean>} true si hidrató datos nuevos
 */
export async function ensureToolLoaded(tool, mode, clientId) {
  const { useDbStore } = await import("@/stores/db-store");
  const { runWithoutOutboundSync } = await import("@/lib/sync-suspend.js");
  const key = `${mode}:${clientId || "libre"}:${tool}`;
  if (inflight.has(key)) return inflight.get(key);

  const work = (async () => {
    const raw = peekRawBucket(useDbStore.getState().db, tool, mode, clientId);
    if (raw && !isToolMetaStub(raw)) return false;
    const prospectId = mode === "client" ? clientId : "libre";
    const row = await fetchToolCalculation({
      id: raw?._id,
      tool,
      prospectId,
    });
    const data = row?.data && typeof row.data === "object" ? row.data : null;
    if (!data) return false;
    runWithoutOutboundSync(() => {
      useDbStore.getState().saveToolBucket(tool, mode, data, clientId, { skipCloud: true });
    });
    return true;
  })();

  inflight.set(key, work);
  try {
    return await work;
  } finally {
    inflight.delete(key);
  }
}
