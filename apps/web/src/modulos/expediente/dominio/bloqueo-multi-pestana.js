/**
 * Multi-pestaña: cada pestaña del navegador tiene un tab_id estable (sessionStorage).
 * Los locks remotos del mismo user_id pero otro tab_id deben bloquear el campo.
 */

export const TAB_ID_STORAGE_KEY = "sts4_expediente_tab_id";

/** @param {{ getItem?: Function, setItem?: Function } | null | undefined} storage */
export function getOrCreateTabId(storage = typeof sessionStorage !== "undefined" ? sessionStorage : null) {
  if (!storage?.getItem || !storage?.setItem) {
    return `mem-${Math.random().toString(36).slice(2, 10)}`;
  }
  try {
    let id = storage.getItem(TAB_ID_STORAGE_KEY);
    if (!id || typeof id !== "string" || id.length < 8) {
      id = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      storage.setItem(TAB_ID_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return `mem-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * ¿Ignorar un field_lock entrante? Eco de esta pestaña o legacy del mismo user sin tab_id.
 * @param {{ myTabId: string|null, myUserId: string|null, payload: { user_id?: string, tab_id?: string } }} args
 */
export function shouldIgnoreRemoteLock({ myTabId, myUserId, payload }) {
  const userId = payload?.user_id;
  if (!userId) return true;
  const remoteTab = payload?.tab_id ? String(payload.tab_id) : null;
  if (myTabId && remoteTab && remoteTab === myTabId) return true;
  if (!remoteTab && myUserId && userId === myUserId) return true;
  return false;
}

/**
 * ¿El lock pertenece a esta pestaña (no debe bloquear la UI local)?
 * @param {{ myTabId: string|null, myUserId: string|null, lock: { user_id?: string, tab_id?: string } }} args
 */
export function isOwnTabLock({ myTabId, myUserId, lock }) {
  if (!lock) return false;
  const remoteTab = lock.tab_id ? String(lock.tab_id) : null;
  if (myTabId && remoteTab) return remoteTab === myTabId;
  return !!(myUserId && lock.user_id === myUserId);
}

/** ¿Lock de otra pestaña del mismo usuario? */
export function isSameUserOtherTab({ myUserId, myTabId, lock }) {
  if (!lock || !myUserId || lock.user_id !== myUserId) return false;
  const remoteTab = lock.tab_id ? String(lock.tab_id) : null;
  if (!remoteTab || !myTabId) return false;
  return remoteTab !== myTabId;
}
