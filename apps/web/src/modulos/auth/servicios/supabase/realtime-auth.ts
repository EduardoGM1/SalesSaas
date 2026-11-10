/** Token en memoria para Realtime (evita race con cookies del SSR). */
let cachedAccessToken: string | null = null;

export function primeRealtimeAuth(accessToken: string | null) {
  cachedAccessToken = accessToken;
}

export function getCachedRealtimeToken() {
  return cachedAccessToken;
}
