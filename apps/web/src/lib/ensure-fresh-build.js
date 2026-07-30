const RELOAD_KEY = "app:build-reload";

async function purgeAppCaches() {
  if ("serviceWorker" in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((reg) => reg.unregister()));
  }
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
}

/** Evita quedar en un bundle viejo tras deploy (PWA / alias desactualizado). */
export async function ensureFreshBuild() {
  if (import.meta.env.DEV) return;

  const embedded = String(import.meta.env.VITE_BUILD_ID || "").trim();
  if (!embedded) return;

  try {
    const res = await fetch(`/build-id.txt?${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;

    const remote = (await res.text()).trim();
    if (!remote || remote === embedded) return;
    if (sessionStorage.getItem(RELOAD_KEY) === remote) return;

    sessionStorage.setItem(RELOAD_KEY, remote);
    console.warn("[build] stale bundle detected, reloading", { embedded, remote });
    await purgeAppCaches();
    window.location.reload();
    await new Promise(() => {});
  } catch {
    /* sin red: seguir con el bundle actual */
  }
}
