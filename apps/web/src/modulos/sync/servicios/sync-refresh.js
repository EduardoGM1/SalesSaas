/**
 * Puente para pedir refresh inbound del SyncProvider
 * (Realtime Dashboard, resume, etc.) sin acoplar ciclos de import.
 */

/** @type {null | ((opts?: { force?: boolean, reason?: string }) => Promise<void>)} */
let refreshHandler = null;

export function registerSyncRefresh(handler) {
  refreshHandler = handler;
}

export function unregisterSyncRefresh(handler) {
  if (refreshHandler === handler) refreshHandler = null;
}

/**
 * @param {{ force?: boolean, reason?: string }} [opts]
 * force=true omite el cooldown de resume (para eventos Realtime).
 */
export function requestSyncRefresh(opts = {}) {
  if (!refreshHandler) return Promise.resolve();
  return refreshHandler(opts) ?? Promise.resolve();
}
