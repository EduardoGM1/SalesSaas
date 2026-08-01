import { notifyAuthChanged } from "@/lib/session-api.js";

/**
 * Canjea tokens de auth presentes en la URL (PKCE code, token_hash OTP o hash implícito).
 * Usado por /auth/callback y /reset-password (recuperación).
 */
export async function consumeAuthParamsFromUrl({ searchParams, t }) {
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash") || searchParams.get("token");
  const type = searchParams.get("type");
  const authError = searchParams.get("error_description") || searchParams.get("error");

  const hash = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
  const hashParams = new URLSearchParams(hash);
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  const hashType = hashParams.get("type");

  if (authError) {
    throw new Error(String(authError));
  }

  if (code) {
    const res = await fetch("/auth/exchange-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ code }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? t?.("auth.login.errorAuth") ?? "Enlace inválido o expirado.");
  } else if (tokenHash && type) {
    const res = await fetch("/auth/verify-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token_hash: tokenHash, type }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? t?.("auth.login.errorAuth") ?? "Enlace inválido o expirado.");
  } else if (accessToken && refreshToken) {
    const res = await fetch("/auth/set-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? t?.("auth.login.errorAuth") ?? "Enlace inválido o expirado.");
  } else {
    return { consumed: false, recovery: type === "recovery" || hashType === "recovery" };
  }

  notifyAuthChanged();
  if (typeof window !== "undefined") {
    const url = new URL(window.location.href);
    url.searchParams.delete("code");
    url.searchParams.delete("token_hash");
    url.searchParams.delete("type");
    url.searchParams.delete("error");
    url.searchParams.delete("error_description");
    url.hash = "";
    const qs = url.searchParams.toString();
    window.history.replaceState({}, "", `${url.pathname}${qs ? `?${qs}` : ""}`);
  }

  return {
    consumed: true,
    recovery: type === "recovery" || hashType === "recovery",
  };
}

export function hasAuthParamsInUrl(searchParams) {
  if (
    searchParams.get("code")
    || ((searchParams.get("token_hash") || searchParams.get("token")) && searchParams.get("type"))
  ) {
    return true;
  }
  if (typeof window === "undefined") return false;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return false;
  const hashParams = new URLSearchParams(hash);
  return Boolean(hashParams.get("access_token") && hashParams.get("refresh_token"));
}
