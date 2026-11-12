/**
 * Garantiza que el cliente Supabase del navegador tenga sesión para Realtime.
 *
 * Camino feliz: la sesión ya está en las cookies `sb-*` que escribió el
 * servidor (@supabase/ssr). Si no, pide `/api/v1/auth/realtime-session` a
 * Express (que valida la cookie) y siembra el cliente.
 *
 * Single-flight: varios callers (presence, dashboard, expediente, chat)
 * comparten una sola hidratación. Evita `Invalid Refresh Token: Already Used`
 * por `setSession` concurrente contra el auto-refresh del cliente.
 */
import { primeRealtimeAuth } from "./client";
import { fetchRealtimeSession } from "@/lib/presence-api.js";

/** @type {Promise<import("@supabase/supabase-js").Session | null> | null} */
let inflight = null;

function isRefreshRaceError(error) {
  const msg = String(error?.message || error || "");
  return /already used|invalid refresh token|refresh token not found/i.test(msg);
}

async function readSession(supabase) {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token && session?.user?.id) {
    primeRealtimeAuth(session.access_token);
    return session;
  }
  return null;
}

/**
 * Siembra Realtime con el access_token sin rotar el refresh (último recurso
 * tras una carrera de refresh). No sustituye una Session completa.
 */
async function primeAccessOnly(supabase, accessToken) {
  if (!accessToken) return;
  primeRealtimeAuth(accessToken);
  try {
    await supabase.realtime.setAuth(accessToken);
  } catch {
    // Realtime puede no estar conectado aún.
  }
}

async function hydrateFromApi(supabase) {
  const existing = await readSession(supabase);
  if (existing) return existing;

  const rt = await fetchRealtimeSession();
  if (!rt?.access_token) return null;

  // Otro caller pudo ganar mientras esperábamos la API.
  const raced = await readSession(supabase);
  if (raced) return raced;

  if (!rt.refresh_token) {
    await primeAccessOnly(supabase, rt.access_token);
    return null;
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: rt.access_token,
    refresh_token: rt.refresh_token,
  });

  if (error) {
    // Carrera típica: auto-refresh u otro ensureBrowserSession ya rotó el refresh.
    const after = await readSession(supabase);
    if (after) return after;
    if (isRefreshRaceError(error)) {
      await primeAccessOnly(supabase, rt.access_token);
    }
    return null;
  }

  const session = data?.session ?? (await readSession(supabase));
  if (session?.access_token) primeRealtimeAuth(session.access_token);
  return session ?? null;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @returns {Promise<import("@supabase/supabase-js").Session | null>} null si no hay sesión válida
 */
export async function ensureBrowserSession(supabase) {
  if (inflight) return inflight;

  const quick = await readSession(supabase);
  if (quick) return quick;

  // Re-check tras el await: otro caller pudo iniciar hidratación.
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      return await hydrateFromApi(supabase);
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
