/**
 * Garantiza que el cliente Supabase del navegador tenga sesión para Realtime.
 *
 * Camino feliz: la sesión ya está en las cookies `sb-*` que escribió el
 * servidor (@supabase/ssr). Si no, pide `/api/v1/auth/realtime-session` a
 * Express (que valida la cookie HttpOnly propia) y siembra el cliente.
 *
 * Único punto de entrada: antes existían 7 copias de esta función.
 */
import { primeRealtimeAuth } from "@/lib/supabase/client";
import { fetchRealtimeSession } from "@/lib/presence-api.js";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @returns {Promise<import("@supabase/supabase-js").Session | null>} null si no hay sesión válida
 */
export async function ensureBrowserSession(supabase) {
  let { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token && session?.user?.id) return session;
  try {
    const rt = await fetchRealtimeSession();
    if (!rt?.access_token || !rt?.refresh_token) return null;
    const { error } = await supabase.auth.setSession({
      access_token: rt.access_token,
      refresh_token: rt.refresh_token,
    });
    if (error) return null;
    ({ data: { session } } = await supabase.auth.getSession());
    if (session?.access_token) primeRealtimeAuth(session.access_token);
    return session ?? null;
  } catch {
    return null;
  }
}
