import dns from "node:dns";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "@salesapp/shared/supabase/config.js";

dns.setDefaultResultOrder("ipv4first");

const FETCH_TIMEOUT_MS = 15_000;

export function fetchWithTimeout(url, options = {}) {
  const { signal: _ignored, ...rest } = options;
  return fetch(url, {
    ...rest,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    keepalive: false,
  });
}

function parseCookieHeader(header = "") {
  return header.split(";").map((part) => {
    const [name, ...rest] = part.trim().split("=");
    return { name, value: rest.join("=") };
  }).filter((c) => c.name);
}

function applySetCookies(res, cookiesToSet) {
  for (const { name, value, ...options } of cookiesToSet) {
    const parts = [`${name}=${value}`];
    if (options.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
    if (options.path) parts.push(`Path=${options.path}`);
    if (options.domain) parts.push(`Domain=${options.domain}`);
    if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
    if (options.httpOnly) parts.push("HttpOnly");
    if (options.secure) parts.push("Secure");
    if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
    res.append("Set-Cookie", parts.join("; "));
  }
}

export function createCookieSupabaseClient(req, res) {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) {
    throw new Error("Supabase no configurado.");
  }
  return createServerClient(url, key, {
    global: { fetch: fetchWithTimeout },
    cookies: {
      getAll: () => parseCookieHeader(req.headers.cookie),
      setAll: (cookiesToSet) => applySetCookies(res, cookiesToSet),
    },
  });
}

export function createAnonSupabaseClient() {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) {
    throw new Error("Supabase no configurado.");
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: fetchWithTimeout },
  });
}

export function createBearerSupabaseClient(token) {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) {
    throw new Error("Supabase no configurado.");
  }
  return createClient(url, key, {
    global: {
      fetch: fetchWithTimeout,
      headers: { Authorization: `Bearer ${token}` },
    },
  });
}

export async function probeSupabaseAuth() {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) {
    return { ok: false, reason: "missing_env", urlPresent: Boolean(url), keyPresent: Boolean(key) };
  }
  const started = Date.now();
  try {
    const res = await fetchWithTimeout(`${url}/auth/v1/health`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    return {
      ok: res.ok,
      status: res.status,
      ms: Date.now() - started,
      urlHost: new URL(url).host,
      keyFormat: key.startsWith("sb_publishable_") ? "publishable" : key.startsWith("eyJ") ? "jwt" : "other",
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "fetch_failed",
      ms: Date.now() - started,
      urlHost: (() => {
        try {
          return new URL(url).host;
        } catch {
          return "invalid_url";
        }
      })(),
    };
  }
}
