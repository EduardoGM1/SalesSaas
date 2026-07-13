/**
 * Aplica un snapshot remoto al estado del formulario sin pisar
 * campos con ediciones locales sin guardar (dirty) ni el campo con foco.
 */
export function applyRemoteFormState(prev, remote, { baselineRef, focusedKey = null } = {}) {
  if (!remote || typeof remote !== "object") return prev;

  if (!baselineRef.current) {
    baselineRef.current = { ...remote };
    return remote;
  }

  const baseline = baselineRef.current;
  const next = { ...prev };
  let changed = false;
  const newBaseline = { ...baseline };
  const keys = new Set([...Object.keys(remote), ...Object.keys(prev), ...Object.keys(baseline)]);

  for (const key of keys) {
    const remoteVal = remote[key] === undefined || remote[key] === null ? "" : String(remote[key]);
    const prevVal = prev[key] === undefined || prev[key] === null ? "" : String(prev[key]);
    const baseVal = baseline[key] === undefined || baseline[key] === null ? "" : String(baseline[key]);

    if (focusedKey && key === focusedKey) continue;

    const dirty = prevVal !== baseVal;
    if (dirty) continue;

    if (prevVal !== remoteVal) {
      next[key] = remoteVal;
      changed = true;
    }
    newBaseline[key] = remoteVal;
  }

  baselineRef.current = newBaseline;
  return changed ? next : prev;
}

export function resetFormBaseline(baselineRef, data) {
  baselineRef.current = data && typeof data === "object" ? { ...data } : {};
}

/** Extrae la key de campo desde un fieldId `tool:key`. */
export function fieldKeyFromCollabId(fieldId, tool) {
  if (!fieldId || !tool) return null;
  const prefix = `${tool}:`;
  return fieldId.startsWith(prefix) ? fieldId.slice(prefix.length) : null;
}
