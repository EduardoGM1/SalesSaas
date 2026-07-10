import { registerSW } from "virtual:pwa-register";

/** Activa SW y recarga al detectar versión nueva (evita chunks 404 tras deploy). */
export function initPwaUpdates() {
  if (!("serviceWorker" in navigator)) return;

  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => registration.update().catch(() => {});
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
      window.setInterval(check, 60 * 60 * 1000);
    },
  });
}
