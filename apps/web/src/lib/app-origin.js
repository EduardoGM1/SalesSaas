/** URL pública única de producción (no usar otros dominios Vercel). */
export const CANONICAL_APP_ORIGIN = "https://saletse.vercel.app";

export function redirectToCanonicalOrigin() {
  if (import.meta.env.DEV) return;

  try {
    const canonicalHost = new URL(CANONICAL_APP_ORIGIN).hostname;
    const host = window.location.hostname;
    if (host === canonicalHost || host === "localhost" || host === "127.0.0.1") return;

    const target = `${CANONICAL_APP_ORIGIN}${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(target);
  } catch {
    /* ignore */
  }
}
