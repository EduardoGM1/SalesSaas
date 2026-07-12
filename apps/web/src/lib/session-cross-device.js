import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import { removeChannelSafe } from "@/lib/presence/realtime.js";
import { clearLocalSession } from "@/lib/session-api.js";

let guardReady = false;
let channel = null;
let tokenIatMs = 0;
let attaching = false;

function readJwtIatMs(token) {
  if (!token || typeof token !== "string") return 0;
  try {
    const part = token.split(".")[1];
    if (!part) return 0;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = JSON.parse(atob(padded));
    return Number(json.iat || 0) * 1000;
  } catch {
    return 0;
  }
}

function isTokenRevokedBy(revokedAtIso) {
  if (!revokedAtIso || !tokenIatMs) return false;
  const revokedAt = new Date(revokedAtIso).getTime();
  if (!Number.isFinite(revokedAt) || revokedAt <= 0) return false;
  return tokenIatMs + 2000 < revokedAt;
}

async function detachChannel() {
  const sb = createClient();
  const ch = channel;
  channel = null;
  if (ch) await removeChannelSafe(sb, ch);
}

async function attachGuard() {
  if (!isSupabaseConfigured() || attaching) return;
  attaching = true;
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id || !session.access_token) {
      tokenIatMs = 0;
      await detachChannel();
      return;
    }

    const nextUserId = session.user.id;
    tokenIatMs = readJwtIatMs(session.access_token);

    // Comprobación inmediata por si el logout ocurrió mientras la app estaba abierta.
    try {
      const { data } = await supabase
        .from("profiles")
        .select("auth_revoked_at")
        .eq("id", nextUserId)
        .maybeSingle();
      if (isTokenRevokedBy(data?.auth_revoked_at)) {
        await clearLocalSession();
        return;
      }
    } catch {
      // Continuar con Realtime/poll aunque falle el select.
    }

    await detachChannel();
    channel = supabase
      .channel(`auth-revoke:${nextUserId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${nextUserId}`,
        },
        (payload) => {
          if (isTokenRevokedBy(payload.new?.auth_revoked_at)) {
            clearLocalSession();
          }
        },
      )
      .subscribe();
  } finally {
    attaching = false;
  }
}

/**
 * Escucha revocación de sesión en otros dispositivos (desktop ↔ PWA)
 * vía Realtime sobre profiles.auth_revoked_at.
 */
export function initCrossDeviceSessionGuard() {
  if (guardReady || typeof window === "undefined") return;
  guardReady = true;

  const refresh = () => {
    attachGuard().catch(() => {});
  };

  refresh();
  window.addEventListener("auth:changed", refresh);
  window.addEventListener("auth:resume", refresh);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
  });
}
