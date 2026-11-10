const INTENT_KEY = "saletse_auth_intent";
const INTENT_COOKIE = "saletse_auth_intent";

export function setAuthIntent(intent) {
  try {
    window.localStorage.setItem(INTENT_KEY, intent);
  } catch {
    /* ignore */
  }
}

export function consumeAuthIntent() {
  let intent = null;
  try {
    intent = window.localStorage.getItem(INTENT_KEY);
    window.localStorage.removeItem(INTENT_KEY);
  } catch {
    /* ignore */
  }
  if (!intent && typeof document !== "undefined") {
    const match = document.cookie.match(/(?:^|;\s*)saletse_auth_intent=([^;]+)/);
    if (match) intent = decodeURIComponent(match[1]);
    document.cookie = `${INTENT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  }
  return intent;
}

export function peekAuthIntent() {
  try {
    const fromLs = window.localStorage.getItem(INTENT_KEY);
    if (fromLs) return fromLs;
  } catch {
    /* ignore */
  }
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)saletse_auth_intent=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Destino SPA que preserva code/token/hash de Auth (nunca tirar a /login pelado). */
export function authHandoffPath({ searchParams, pathname = "/auth/callback" } = {}) {
  const search = searchParams?.toString?.()
    ? `?${searchParams.toString()}`
    : typeof window !== "undefined"
      ? window.location.search
      : "";
  const hash = typeof window !== "undefined" ? window.location.hash : "";
  return `${pathname}${search}${hash}`;
}

export function isRecoveryAuthUrl(searchParams) {
  if (searchParams?.get("type") === "recovery") return true;
  if (typeof window === "undefined") return false;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return false;
  return new URLSearchParams(hash).get("type") === "recovery";
}
