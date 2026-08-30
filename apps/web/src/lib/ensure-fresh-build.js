import { purgeAppCaches } from "@/lib/purge-app-caches.js";

const RELOAD_KEY = "app:build-reload";
const MAX_ATTEMPTS = 3;
let inflight = null;

async function checkFreshBuild() {
  const embedded = String(import.meta.env.VITE_BUILD_ID || "").trim();
  if (!embedded) return;

  try {
    const res = await fetch(`/build-id.txt?${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;

    const remote = (await res.text()).trim();
    if (!remote || remote === embedded) return;

    let n = 0;
    try {
      n = Number(sessionStorage.getItem(`${RELOAD_KEY}:${remote}`) || 0);
    } catch {
      /* sessionStorage bloqueado */
    }
    if (n >= MAX_ATTEMPTS) return;

    try {
      sessionStorage.setItem(`${RELOAD_KEY}:${remote}`, String(n + 1));
    } catch {
      /* sessionStorage bloqueado */
    }

    console.warn("[build] stale bundle detected, reloading", { embedded, remote, attempt: n + 1 });
    await purgeAppCaches();
    // El JS nuevo (este reload) migra/invalida el blob plano sts4_v1 → sts4_v1:{workspaceId}
    // en local-storage-adapter (schema v2). No borramos localStorage aquí: rompería la sesión.
    window.location.reload();
    await new Promise(() => {});
  } catch {
    /* sin red: seguir con el bundle actual */
  }
}

/** Evita quedar en un bundle viejo tras deploy (PWA / alias desactualizado). */
export async function ensureFreshBuild() {
  if (import.meta.env.DEV) return;
  if (inflight) return inflight;
  inflight = checkFreshBuild().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Revalida build-id al recuperar foco: una PWA instalada puede no “reabrirse”. */
export function initEnsureFreshBuildWatchers() {
  if (import.meta.env.DEV) return;
  const onResume = () => {
    void ensureFreshBuild();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") onResume();
  });
  window.addEventListener("focus", onResume);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) onResume();
  });
}
