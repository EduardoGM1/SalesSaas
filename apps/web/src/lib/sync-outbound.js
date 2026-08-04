/**
 * Puente para forzar push outbound (PUT /sync) sin ciclos de import.
 * Usado al crear expedientes / mutaciones críticas en PWA.
 */

/** @type {null | ((opts?: { reason?: string }) => Promise<void>)} */
let pushHandler = null;

export function registerSyncPush(handler) {
  pushHandler = handler;
}

export function unregisterSyncPush(handler) {
  if (pushHandler === handler) pushHandler = null;
}

/**
 * Fuerza reconcile outbound lo antes posible.
 * @param {{ reason?: string }} [opts]
 */
export function requestSyncPush(opts = {}) {
  if (!pushHandler) return Promise.resolve();
  return pushHandler(opts) ?? Promise.resolve();
}
