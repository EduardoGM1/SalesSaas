import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, primeRealtimeAuth } from "@/lib/supabase/client";
import { fetchRealtimeSession } from "@/lib/presence-api.js";
import { ensureRealtimeReady, removeChannelSafe } from "@/lib/presence/realtime.js";
import { clearLocalSession, notifyAuthChanged } from "@/lib/session-api.js";

/** Canal simétrico móvil ↔ desktop: `user-session:{userId}` */
export const SESSION_SYNC_EVENT = "SIGNED_OUT";

let guardReady = false;
let channel = null;
let subscribedUserId = null;
let channelJoined = false;
let tokenIatMs = 0;
let attaching = false;
let handlingRemote = false;

function sessionTopic(userId) {
  return `user-session:${userId}`;
}

function tlog(stage, msOrExtra, extra) {
  if (typeof msOrExtra === "number") {
    console.info(`[session-sync] +${msOrExtra}ms ${stage}`, extra ?? "");
  } else {
    console.info(`[session-sync] ${Date.now()} ${stage}`, msOrExtra ?? "");
  }
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

function isChannelHot(userId) {
  return Boolean(channel && channelJoined && subscribedUserId && (!userId || subscribedUserId === userId));
}

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

async function checkRevokedOrIgnore(supabase, userId) {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("auth_revoked_at")
      .eq("id", userId)
      .maybeSingle();
    if (isTokenRevokedBy(data?.auth_revoked_at)) {
      await handleRemoteSignedOut("postgres-poll");
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

async function handleRemoteSignedOut(source = "broadcast") {
  if (handlingRemote) return;
  handlingRemote = true;
  const t0 = Date.now();
  tlog("remote:start", { source });
  try {
    await detachSessionSync();
    await clearLocalSession({ notify: false });
  } finally {
    handlingRemote = false;
  }
  notifyAuthChanged();
  tlog("remote:done", Date.now() - t0, { source });
}

/** Quita el canal Realtime (evitar listeners huérfanos). */
export async function detachSessionSync() {
  const sb = createClient();
  const ch = channel;
  channel = null;
  subscribedUserId = null;
  channelJoined = false;
  tokenIatMs = 0;
  if (ch) await removeChannelSafe(sb, ch);
}

async function sendSignedOut(ch, userId) {
  await ch.send({
    type: "broadcast",
    event: SESSION_SYNC_EVENT,
    payload: {
      at: new Date().toISOString(),
      reason: "logout",
      userId,
    },
  });
}

/**
 * Emite SIGNED_OUT lo antes posible.
 * Preferencia: canal ya unido (caliente). Si no, intenta cold path corto (&lt;600ms).
 */
export async function broadcastRemoteSignedOut() {
  const t0 = Date.now();
  tlog("broadcast:start", { hot: isChannelHot() });

  if (!isSupabaseConfigured()) {
    tlog("broadcast:skip", Date.now() - t0, { reason: "no-config" });
    return { ok: false, reason: "no-config" };
  }

  // FAST PATH: canal persistente ya conectado — no esperar Auth ni reconnect.
  if (isChannelHot()) {
    try {
      await sendSignedOut(channel, subscribedUserId);
      tlog("broadcast:sent-hot", Date.now() - t0);
      return { ok: true, mode: "hot", ms: Date.now() - t0 };
    } catch (err) {
      tlog("broadcast:hot-fail", Date.now() - t0, err?.message);
    }
  }

  // COLD PATH acotado: no bloquear logout más de ~600ms.
  const cold = (async () => {
    const supabase = createClient();
    const session = await ensureBrowserSession(supabase);
    const userId = session?.user?.id;
    if (!userId || !session.access_token) return { ok: false, reason: "no-session" };

    await ensureRealtimeReady(supabase, session.access_token, 400);

    // Si mientras tanto el attach dejó el canal caliente, usarlo.
    if (isChannelHot(userId)) {
      await sendSignedOut(channel, userId);
      return { ok: true, mode: "hot-late" };
    }

    const ch = supabase.channel(sessionTopic(userId), {
      config: { broadcast: { self: false, ack: false } },
    });
    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") finish();
      });
      setTimeout(finish, 450);
    });

    try {
      await sendSignedOut(ch, userId);
      return { ok: true, mode: "cold" };
    } finally {
      await removeChannelSafe(supabase, ch);
    }
  })();

  const result = await Promise.race([
    cold,
    delay(600).then(() => ({ ok: false, reason: "timeout" })),
  ]);
  tlog("broadcast:done", Date.now() - t0, result);
  return result;
}

async function attachSessionSync({ force = false } = {}) {
  if (!isSupabaseConfigured() || attaching || handlingRemote) return;
  attaching = true;
  const t0 = Date.now();
  try {
    const supabase = createClient();
    const session = await ensureBrowserSession(supabase);
    if (!session?.user?.id || !session.access_token) {
      await detachSessionSync();
      return;
    }

    const userId = session.user.id;
    tokenIatMs = readJwtIatMs(session.access_token);

    // Canal persistente: no recrear en cada resume/token refresh.
    if (!force && isChannelHot(userId)) {
      await checkRevokedOrIgnore(supabase, userId);
      tlog("attach:keep-hot", Date.now() - t0);
      return;
    }

    if (await checkRevokedOrIgnore(supabase, userId)) return;

    await ensureRealtimeReady(supabase, session.access_token, 2_000);
    await detachSessionSync();

    const topic = sessionTopic(userId);
    channelJoined = false;
    channel = supabase
      .channel(topic, { config: { broadcast: { self: false, ack: false } } })
      .on("broadcast", { event: SESSION_SYNC_EVENT }, () => {
        tlog("recv:SIGNED_OUT", { topic });
        handleRemoteSignedOut("broadcast");
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
            tlog("recv:auth_revoked_at");
            handleRemoteSignedOut("postgres_changes");
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
          channelJoined = true;
          tlog("attach:subscribed", Date.now() - t0, { topic });
          finish();
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          tlog("attach:subscribe-fail", Date.now() - t0, { status });
          finish();
        }
      });
      setTimeout(finish, 2500);
    });
  } finally {
    attaching = false;
  }
}

/**
 * Servicio único de sync de sesión (web desktop ↔ PWA móvil).
 * Suscribe una vez y mantiene el canal abierto.
 */
export function initSessionSync() {
  if (guardReady || typeof window === "undefined") return;
  guardReady = true;

  const refresh = (opts) => {
    attachSessionSync(opts).catch((err) => {
      console.warn("[session-sync] attach:", err?.message || err);
    });
  };

  refresh({ force: true });

  try {
    const supabase = createClient();
    supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "SIGNED_OUT") {
        detachSessionSync().catch(() => {});
        return;
      }
      if (event === "TOKEN_REFRESHED") {
        // Solo actualizar iat; NO recrear canal (evita latencia de renegociación).
        if (nextSession?.access_token) {
          tokenIatMs = readJwtIatMs(nextSession.access_token);
          primeRealtimeAuth(nextSession.access_token);
        }
        return;
      }
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        refresh({ force: true });
      }
    });
  } catch {
    // ignore
  }

  window.addEventListener("auth:changed", () => refresh());
  window.addEventListener("auth:resume", () => refresh());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
  });
}

/** @deprecated usar initSessionSync */
export function initCrossDeviceSessionGuard() {
  initSessionSync();
}
