import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, primeRealtimeAuth } from "@/lib/supabase/client";
import { fetchRealtimeSession } from "@/lib/presence-api.js";
import { ensureRealtimeReady, removeChannelSafe } from "@/lib/presence/realtime.js";
import { clearLocalSession } from "@/lib/session-api.js";

/** Canal simétrico móvil ↔ desktop: `user-session:{userId}` */
export const SESSION_SYNC_EVENT = "SIGNED_OUT";

let guardReady = false;
let channel = null;
let subscribedUserId = null;
let tokenIatMs = 0;
let attaching = false;
let handlingRemote = false;
let authListener = null;

function sessionTopic(userId) {
  return `user-session:${userId}`;
}

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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Hidrata el cliente browser con cookies de la API (desktop a menudo no tiene
 * sesión en createBrowserClient hasta este paso — Presence hace lo mismo).
 */
async function ensureBrowserSession(supabase) {
  let { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token && session?.user?.id) return session;

  try {
    const rt = await fetchRealtimeSession();
    const { error } = await supabase.auth.setSession({
      access_token: rt.access_token,
      refresh_token: rt.refresh_token,
    });
    if (error) return null;
    ({ data: { session } } = await supabase.auth.getSession());
    if (session?.access_token) primeRealtimeAuth(session.access_token);
    return session;
  } catch {
    return null;
  }
}

async function handleRemoteSignedOut() {
  if (handlingRemote) return;
  handlingRemote = true;
  try {
    await detachSessionSync();
    // notify al final: evita que auth:changed intente re-attach mientras aún “handling”.
    await clearLocalSession({ notify: false });
  } finally {
    handlingRemote = false;
  }
  const { notifyAuthChanged } = await import("@/lib/session-api.js");
  notifyAuthChanged();
}

/** Quita el canal Realtime (evitar listeners huérfanos). */
export async function detachSessionSync() {
  const sb = createClient();
  const ch = channel;
  channel = null;
  subscribedUserId = null;
  tokenIatMs = 0;
  if (ch) await removeChannelSafe(sb, ch);
}

/**
 * Emite SIGNED_OUT a todos los demás dispositivos del mismo usuario.
 * Debe llamarse ANTES de invalidar la sesión local (mientras Realtime sigue auth).
 */
export async function broadcastRemoteSignedOut() {
  if (!isSupabaseConfigured()) return;
  const supabase = createClient();
  const session = await ensureBrowserSession(supabase);
  const userId = session?.user?.id;
  if (!userId || !session.access_token) return;

  await ensureRealtimeReady(supabase, session.access_token, 5_000);

  let ch = channel;
  let temporary = false;
  if (!ch || subscribedUserId !== userId) {
    temporary = true;
    ch = supabase.channel(sessionTopic(userId), {
      config: { broadcast: { self: false } },
    });
    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          finish();
        }
      });
      setTimeout(finish, 2500);
    });
  }

  try {
    await ch.send({
      type: "broadcast",
      event: SESSION_SYNC_EVENT,
      payload: {
        at: new Date().toISOString(),
        reason: "logout",
        from: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
      },
    });
    // Dar tiempo a que el frame salga por el socket antes de signOut.
    await delay(150);
  } catch (err) {
    console.warn("[session-sync] broadcast SIGNED_OUT:", err?.message || err);
  } finally {
    if (temporary && ch) await removeChannelSafe(supabase, ch);
  }
}

async function attachSessionSync() {
  if (!isSupabaseConfigured() || attaching || handlingRemote) return;
  attaching = true;
  try {
    const supabase = createClient();
    const session = await ensureBrowserSession(supabase);
    if (!session?.user?.id || !session.access_token) {
      await detachSessionSync();
      return;
    }

    const userId = session.user.id;
    tokenIatMs = readJwtIatMs(session.access_token);

    // Si ya estamos suscritos al mismo usuario, no recrear el canal.
    if (channel && subscribedUserId === userId) {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("auth_revoked_at")
          .eq("id", userId)
          .maybeSingle();
        if (isTokenRevokedBy(data?.auth_revoked_at)) {
          await handleRemoteSignedOut();
        }
      } catch {
        // ignore
      }
      return;
    }

    // Revocación ya aplicada (p. ej. logout desde otro device mientras desconectado).
    try {
      const { data } = await supabase
        .from("profiles")
        .select("auth_revoked_at")
        .eq("id", userId)
        .maybeSingle();
      if (isTokenRevokedBy(data?.auth_revoked_at)) {
        await handleRemoteSignedOut();
        return;
      }
    } catch {
      // Seguir con suscripción.
    }

    await ensureRealtimeReady(supabase, session.access_token, 8_000);
    await detachSessionSync();

    const topic = sessionTopic(userId);
    channel = supabase
      .channel(topic, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: SESSION_SYNC_EVENT }, () => {
        handleRemoteSignedOut();
      })
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          if (isTokenRevokedBy(payload.new?.auth_revoked_at)) {
            handleRemoteSignedOut();
          }
        },
      );

    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          subscribedUserId = userId;
          finish();
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") finish();
      });
      setTimeout(finish, 8000);
    });
  } finally {
    attaching = false;
  }
}

/**
 * Servicio único de sync de sesión (web desktop ↔ PWA móvil).
 * Suscribe a `user-session:{id}` (Broadcast SIGNED_OUT) + postgres_changes.
 */
export function initSessionSync() {
  if (guardReady || typeof window === "undefined") return;
  guardReady = true;

  const refresh = () => {
    attachSessionSync().catch((err) => {
      console.warn("[session-sync] attach:", err?.message || err);
    });
  };

  refresh();

  // Tras hidratar cookies → setSession (Presence) o login/logout.
  try {
    const supabase = createClient();
    authListener = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        detachSessionSync().catch(() => {});
        return;
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
        refresh();
      }
    }).data.subscription;
  } catch {
    // ignore
  }

  window.addEventListener("auth:changed", refresh);
  window.addEventListener("auth:resume", refresh);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
  });
}

/** @deprecated usar initSessionSync */
export function initCrossDeviceSessionGuard() {
  initSessionSync();
}
