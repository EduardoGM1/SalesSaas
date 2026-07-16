/**
 * Caché de plan en memoria (misma pestaña).
 * Sobrevive remounts; se limpia en logout.
 */
let planCache = null;

export function getUserPlanCache() {
  return planCache;
}

export function setUserPlanCache(next) {
  planCache = next;
}

export function clearUserPlanCache() {
  planCache = null;
}
