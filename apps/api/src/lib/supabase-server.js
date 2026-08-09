import dns from "node:dns";
import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { getSupabaseAnonKey, getSupabaseUrl } from "@salesapp/shared/supabase/config.js";

dns.setDefaultResultOrder("ipv4first");

const FETCH_TIMEOUT_MS = 15_000;

/** Node < 22 no tiene WebSocket nativo; Supabase Realtime lo requiere al instanciar el cliente. */
const REALTIME_OPTIONS = { transport: ws };

function baseClientOptions(overrides = {}) {
  return {
    global: { fetch: fetchWithTimeout },
    realtime: REALTIME_OPTIONS,
    ...overrides,
  };
}

function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
}

/** Cookies Secure solo con HTTPS; en VPS por IP (http://) deben ir sin Secure. */
function cookieSecure() {
  if (process.env.COOKIE_SECURE === "false") return false;
  const origin = String(process.env.WEB_ORIGIN ?? "");
  if (origin.startsWith("http://")) return false;
  return isProductionRuntime();
}

export function fetchWithTimeout(url, options = {}) {
  const { signal: _ignored, ...rest } = options;
  return fetch(url, {
    ...rest,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    keepalive: false,
  });
}

function createCookieHandlers(req, res) {
  return {
    getAll() {
      return parseCookieHeader(req.headers.cookie ?? "");
    },
    setAll(cookiesToSet, headers = {}) {
      for (const { name, value, options } of cookiesToSet) {
        res.append("Set-Cookie", serializeCookieHeader(name, value, options));
      }
      for (const [key, value] of Object.entries(headers)) {
        res.setHeader(key, value);
      }
    },
  };
}

export function createCookieSupabaseClient(req, res) {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) {
    throw new Error("Supabase no configurado.");
  }
  return createServerClient(url, key, {
    ...baseClientOptions(),
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: cookieSecure(),
    },
    cookies: createCookieHandlers(req, res),
  });
}

export function createAnonSupabaseClient() {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) {
    throw new Error("Supabase no configurado.");
  }
  return createClient(url, key, baseClientOptions({
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }));
}

/**
 * Cliente para recovery emails: flow implícito (tokens en el hash de la URL).
 * Evita PKCE/`code_verifier`, que falla al abrir el correo en otro navegador,
 * app de correo o ventana de incógnito ("invalid flow state").
 */
export function createRecoveryEmailClient() {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) {
    throw new Error("Supabase no configurado.");
  }
  return createClient(url, key, baseClientOptions({
    auth: {
      flowType: "implicit",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }));
}

export function createBearerSupabaseClient(token) {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) {
    throw new Error("Supabase no configurado.");
  }
  return createClient(url, key, baseClientOptions({
    global: {
      fetch: fetchWithTimeout,
      headers: { Authorization: `Bearer ${token}` },
    },
  }));
}

/** Cliente con service_role para tareas de servidor (p. ej. enviar push). */
export function createServiceSupabaseClient() {
  const url = getSupabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return null;
  }
  return createClient(url, key, baseClientOptions({
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }));
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
