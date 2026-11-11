/**
 * Allowlist de ids del último GET /prospects por workspace activo.
 * null = aún no hubo mirror (UI no filtra).
 */
const byWorkspace = new Map();

export function setVisibleProspectIds(workspaceId, ids) {
  if (!workspaceId) return;
  if (ids == null) {
    byWorkspace.set(String(workspaceId), null);
    return;
  }
  byWorkspace.set(
    String(workspaceId),
    new Set([...ids].map((id) => String(id || "").trim()).filter(Boolean)),
  );
}

export function getVisibleProspectIds(workspaceId) {
  if (!workspaceId) return null;
  const v = byWorkspace.get(String(workspaceId));
  return v === undefined ? null : v;
}

export function clearVisibleProspectIds(workspaceId) {
  if (!workspaceId) {
    byWorkspace.clear();
    return;
  }
  byWorkspace.delete(String(workspaceId));
}

/** Amplía allowlist tras cargar más páginas REST (sin reemplazar el mirror). */
export function mergeVisibleProspectIds(workspaceId, ids) {
  if (!workspaceId || ids == null) return;
  const key = String(workspaceId);
  const incoming = new Set([...ids].map((id) => String(id || "").trim()).filter(Boolean));
  const cur = byWorkspace.get(key);
  if (cur === undefined || cur === null) {
    byWorkspace.set(key, incoming);
    return;
  }
  for (const id of incoming) cur.add(id);
}
