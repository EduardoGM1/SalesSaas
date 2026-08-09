/** URL pública canónica (Vercel o override en build: VITE_CANONICAL_ORIGIN). */
export const CANONICAL_APP_ORIGIN =
  import.meta.env.VITE_CANONICAL_ORIGIN || "https://saletse.vercel.app";

const LEGACY_VERCEL_HOST_RE = /\.vercel\.app$/i;

/** Solo subdominios Vercel obsoletos; IP y dominios propios no redirigen. */
export function isLegacyVercelHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (!LEGACY_VERCEL_HOST_RE.test(host)) return false;
  try {
    const canonicalHost = new URL(CANONICAL_APP_ORIGIN).hostname.toLowerCase();
    return host !== canonicalHost;
  } catch {
    return host !== "saletse.vercel.app";
  }
}

export function redirectToCanonicalOrigin() {
  if (import.meta.env.DEV) return;

  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return;
  if (!isLegacyVercelHost(host)) return;

  const target = `${CANONICAL_APP_ORIGIN}${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(target);
}
