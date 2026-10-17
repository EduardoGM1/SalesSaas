/** Throttle de console.warn para broadcasts de lock/unlock. */
export const WARN_THROTTLE_MS = 5_000;

/**
 * @param {Map<string, number>} lastAt
 * @param {string} key
 * @param {number} now
 * @param {number} [windowMs]
 * @returns {boolean} true si se debe emitir el warn ahora
 */
export function noteThrottledWarn(lastAt, key, now, windowMs = WARN_THROTTLE_MS) {
  const prev = lastAt.get(key);
  if (prev != null && now - prev < windowMs) return false;
  lastAt.set(key, now);
  return true;
}
