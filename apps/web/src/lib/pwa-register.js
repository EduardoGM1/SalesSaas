import { registerSW } from "virtual:pwa-register";

let reloading = false;

function reloadOnce() {
  if (reloading) return;
  reloading = true;
  window.location.reload();
}

async function purgeStaleAppCaches() {
  if (!("caches" in window)) return;
  try {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => /workbox|precache|html-navigate|api-cache/i.test(key))
        .map((key) => caches.delete(key)),
    );
  } catch {
    // ignore
  }
}

/**
 * Si el HTML/SW quedó en una revisión vieja, el script module apunta a un chunk 404.
 * En ese caso se limpian caches y se recarga una vez.
 */
async function recoverFromStaleModuleScript() {
  if (!("serviceWorker" in navigator)) return;
  const script = document.querySelector('script[type="module"][src*="/assets/"]');
  if (!script?.src) return;

  try {
    const res = await fetch(script.src, { method: "HEAD", cache: "no-store" });
    if (res.ok) return;

    console.warn("[pwa] stale module script detected, purging caches", script.src, res.status);
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((reg) => reg.unregister()));
    await purgeStaleAppCaches();
    reloadOnce();
  } catch {
    // Sin red: no forzar reload en bucle.
  }
}

/** Activa SW y recarga al detectar versión nueva (evita chunks 404 tras deploy). */
export function initPwaUpdates() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    reloadOnce();
  });

  void recoverFromStaleModuleScript();

  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;

      const askWaitingToActivate = () => {
        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      };

      const check = () => {
        registration.update().then(askWaitingToActivate).catch(() => {});
      };

      askWaitingToActivate();
      check();

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
      window.addEventListener("focus", check);
      window.setInterval(check, 15 * 60 * 1000);
    },
    onNeedRefresh() {
      // registerType autoUpdate debería auto-aplicar; forzar por si el prompt path aparece.
      reloadOnce();
    },
  });
}
