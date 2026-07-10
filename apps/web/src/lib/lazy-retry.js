import { lazy } from "react";

const RELOAD_KEY = "vite:chunk-reload";

export function clearChunkReloadFlag() {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* ignore */
  }
}

function isStaleChunkError(err) {
  const msg = String(err?.message || err || "");
  return (
    err?.name === "ChunkLoadError"
    || msg.includes("Failed to fetch dynamically imported module")
    || msg.includes("Importing a module script failed")
    || msg.includes("error loading dynamically imported module")
  );
}

/** Lazy import con recarga automática si el chunk quedó obsoleto tras un deploy. */
export function namedLazy(loader, exportName) {
  return lazy(() =>
    loader()
      .then((m) => {
        clearChunkReloadFlag();
        return { default: m[exportName] };
      })
      .catch((err) => {
        if (isStaleChunkError(err) && !sessionStorage.getItem(RELOAD_KEY)) {
          sessionStorage.setItem(RELOAD_KEY, "1");
          window.location.reload();
          return new Promise(() => {});
        }
        clearChunkReloadFlag();
        throw err;
      }),
  );
}
