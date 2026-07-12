import { isSupabaseConfigured } from "@salesapp/shared/supabase/config.js";
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
 * Tras signOut global el access JWT sigue válido hasta `exp`.
 * Si el perfil tiene auth_revoked_at > iat del token → sesión revocada.
 */
async function assertSessionNotRevoked(supabase, userId, accessToken) {
  const iatMs = readJwtIatMs(accessToken);
  if (!iatMs || !userId) return { ok: true };

  const { data, error } = await supabase
    .from("profiles")
    .select("auth_revoked_at")
    .eq("id", userId)
    .maybeSingle();

  // Columna aún no migrada / error temporal: no bloquear el login.
  if (error) {
    if (String(error.message || "").includes("auth_revoked_at")) return { ok: true };
    console.warn("[authenticateApi] auth_revoked_at:", error.message);
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
    console.error("[authenticateApi]", err);
    return { ok: false, status: 503, message: "Supabase no configurado." };
  }

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { ok: false, status: 401, message: "No autenticado." };
  }

  let accessToken = bearer;
  if (!accessToken) {
    const { data: { session } } = await supabase.auth.getSession();
    accessToken = session?.access_token ?? null;
  }

  const revoked = await assertSessionNotRevoked(supabase, user.id, accessToken);
  if (!revoked.ok) return revoked;

  return { ok: true, supabase, userId: user.id };
}
