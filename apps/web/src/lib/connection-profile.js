/** Perfil de red del dispositivo (Chrome/Android: Network Information API). */

export function getConnectionProfile() {
  if (typeof navigator === "undefined") {
    return { saveData: false, slow: false, effectiveType: "unknown" };
  }
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const saveData = conn?.saveData === true;
  const effectiveType = conn?.effectiveType || "unknown";
  const slow = saveData || effectiveType === "slow-2g" || effectiveType === "2g" || effectiveType === "3g";
  return { saveData, slow, effectiveType };
}

/** Reducir Realtime no crítico (presencia de contactos, dashboard en background). */
export function shouldLimitBackgroundRealtime() {
  return getConnectionProfile().slow;
}

/** Intervalo de heartbeat de presencia según tipo de red (ms). */
export function presenceHeartbeatMs() {
  return shouldLimitBackgroundRealtime() ? 120_000 : 45_000;
}
