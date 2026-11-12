import { isSupabaseConfigured } from "@salesapp/shared/supabase/config.js";
import { logger } from "../lib/logger.js";
import {
  createBearerSupabaseClient,
  createCookieSupabaseClient,
} from "../lib/supabase-server.js";

/** Lee el claim `iat` del JWT (ms). Tokens previos a auth_revoked_at se rechazan. */
export function readJwtIatMs(token) {
  if (!token || typeof token !== "string") return 0;
  try {
    const part = token.split(".")[1];
    if (!part) return 0;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    return Number(json.iat || 0) * 1000;
  } catch {
    return 0;
  }
}

function bearerTokenFromRequest(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

/**
 * Fail-closed selectivo (C-08): si falla la consulta a profiles.auth_revoked_at,
 * rechazar escrituras y rutas sensibles; permitir lecturas con aviso en logs.
 * No aplica a ausencia de columna (migración pendiente) — eso sigue fail-open.
 */
export function sessionRevocationFailClosed(req) {
  const method = String(req?.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") return true;
  const path = String(req?.path || req?.url || "").split("?")[0];
  // Lecturas sensibles: admin / roles / permisos / sync (aunque sync PUT ya cae arriba).
  if (/\/admin(?:\/|$)/i.test(path)) return true;
  if (/\/(?:roles|permissions|permisos)(?:\/|$)/i.test(path)) return true;
  if (/\/sync(?:\/|$)/i.test(path)) return true;
  return false;
}

/**
 * Tras signOut global el access JWT sigue válido hasta `exp`.
 * Si el perfil tiene auth_revoked_at > iat del token → sesión revocada.
 */
export async function assertSessionNotRevoked(supabase, userId, accessToken, { failClosed = false } = {}) {
  const iatMs = readJwtIatMs(accessToken);
  if (!iatMs || !userId) return { ok: true };

  const { data, error } = await supabase
    .from("profiles")
    .select("auth_revoked_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    // Columna aún no migrada: no bloquear.
    if (String(error.message || "").includes("auth_revoked_at")) return { ok: true };
    logger.warn("auth.revoked_at_lookup_failed", {
      error: error.message,
      failClosed,
    });
    if (failClosed) {
      return { ok: false, status: 503, message: "No se pudo verificar la sesión. Intenta de nuevo." };
    }
    return { ok: true };
  }

  const revokedAt = data?.auth_revoked_at ? new Date(data.auth_revoked_at).getTime() : 0;
  if (!revokedAt) return { ok: true };

  // 2s de gracia por desfase de reloj entre dispositivos.
  if (iatMs + 2000 < revokedAt) {
    return { ok: false, status: 401, message: "Sesión cerrada en otro dispositivo." };
  }
  return { ok: true };
}

export async function authenticateApi(req, res) {
  if (!isSupabaseConfigured()) {
    return { ok: false, status: 503, message: "Supabase no configurado." };
  }

  const bearer = bearerTokenFromRequest(req);
  let supabase;

  try {
    if (bearer) {
      supabase = createBearerSupabaseClient(bearer);
    } else {
      supabase = createCookieSupabaseClient(req, res);
    }
  } catch (err) {
    logger.error(err, { scope: "authenticateApi" });
    return { ok: false, status: 503, message: "Supabase no configurado." };
  }

  let { data: { user }, error } = await supabase.auth.getUser();
  let accessToken = bearer;

  // Cookie path: access JWT caducado → getUser falla aunque el refresh sea válido.
  // Intentar getSession (puede refrescar y escribir Set-Cookie) antes del 401.
  if ((error || !user) && !bearer) {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    accessToken = session?.access_token ?? null;
    if (accessToken) {
      ({ data: { user }, error } = await supabase.auth.getUser(accessToken));
    } else if (sessionError && /already used|invalid refresh token/i.test(sessionError.message || "")) {
      // Otro request concurrente pudo rotar el refresh; reintentar getUser una vez.
      ({ data: { user }, error } = await supabase.auth.getUser());
      if (!accessToken) {
        const { data: { session: again } } = await supabase.auth.getSession();
        accessToken = again?.access_token ?? null;
      }
    }
  }

  if (error || !user) {
    return { ok: false, status: 401, message: "No autenticado." };
  }

  if (!accessToken) {
    const { data: { session } } = await supabase.auth.getSession();
    accessToken = session?.access_token ?? null;
  }

  const revoked = await assertSessionNotRevoked(supabase, user.id, accessToken, {
    failClosed: sessionRevocationFailClosed(req),
  });
  if (!revoked.ok) return revoked;

  return { ok: true, supabase, userId: user.id };
}
