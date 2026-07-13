/**
 * Hidrata / fusiona snapshots remotos en formularios colaborativos.
 * Regla: nunca pisar keys en dirtyKeys ni la key con foco.
 */

export function fieldKeyFromCollabId(fieldId, tool) {
  if (!fieldId || !tool) return null;
  const prefix = `${tool}:`;
  return fieldId.startsWith(prefix) ? fieldId.slice(prefix.length) : null;
}

/**
 * @param {Record<string, string>} prev
 * @param {Record<string, string>} remote
 * @param {{ dirtyKeys?: Set<string>, focusedKey?: string|null, hydratedRef?: { current: boolean } }} opts
 */
export function applyRemoteFormState(prev, remote, opts = {}) {
  if (!remote || typeof remote !== "object") return prev;
  const dirtyKeys = opts.dirtyKeys || null;
  const focusedKey = opts.focusedKey || null;
  const hydratedRef = opts.hydratedRef || null;

  // Primera carga: aceptar snapshot completo una sola vez.
  if (hydratedRef && !hydratedRef.current) {
    hydratedRef.current = true;
    return { ...remote };
  }

  const next = { ...prev };
  let changed = false;

  for (const key of Object.keys(remote)) {
    if (key === "stype" || key === "futureType") continue;
    if (dirtyKeys?.has(key)) continue;
    if (focusedKey && key === focusedKey) {
      dirtyKeys?.add(key);
      continue;
    }
    const remoteVal = remote[key] === undefined || remote[key] === null ? "" : String(remote[key]);
    const prevVal = prev[key] === undefined || prev[key] === null ? "" : String(prev[key]);
    if (prevVal !== remoteVal) {
      next[key] = remoteVal;
      changed = true;
    }
  }

  return changed ? next : prev;
}

export function markFieldsDirty(dirtyKeysRef, keys) {
  if (!dirtyKeysRef?.current) return;
  const list = Array.isArray(keys) ? keys : [keys];
  for (const k of list) {
    if (k) dirtyKeysRef.current.add(k);
  }
}

export function clearDirtyFields(dirtyKeysRef) {
  dirtyKeysRef?.current?.clear();
}
