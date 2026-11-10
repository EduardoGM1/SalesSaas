/**
 * Reset del estado local ligado a un usuario (blob CRM, prefs, outbox, caché
 * de respuestas /api del Service Worker). Se invoca al cerrar sesión y cuando
 * el usuario autenticado no es el dueño del blob local (dispositivo compartido).
 *
 * Vive fuera de `local-storage-adapter` para evitar el ciclo
 * db-store → adapter → db-store.
 */
import { clearLocalCrmStorage } from "@/lib/storage/local-storage-adapter";
import { emptyDatabase } from "@/lib/storage/types";
import { runWithoutOutboundSync } from "@/lib/sync-suspend.js";
import { useDbStore } from "@/stores/db-store";

/** Nombre del runtime cache del SW para /api (ver vite.config.js). */
const API_CACHE_NAME = "api-cache";

/** Borra solo la caché de respuestas /api; no toca precache ni desregistra el SW. */
export async function purgeApiResponseCache() {
  if (typeof window === "undefined" || !("caches" in window)) return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.includes(API_CACHE_NAME)).map((k) => caches.delete(k)));
  } catch {
    // ignore
  }
}

/**
 * Vacía memoria (zustand) y localStorage del CRM. Corre sin disparar sync
 * outbound para que el `replaceDb` vacío no se interprete como borrado remoto.
 */
export function resetLocalCrmState() {
  clearLocalCrmStorage();
  runWithoutOutboundSync(() => {
    useDbStore.setState({ db: emptyDatabase() });
  });
}

/** Limpieza completa al cerrar sesión (local + caché SW). */
export async function resetLocalUserState() {
  resetLocalCrmState();
  await purgeApiResponseCache();
}
