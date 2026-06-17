import { channelHasPresence, presenceTopic } from "@/lib/presence/topics.js";

const HEARTBEAT_MS = 45_000;
const MAX_SUBSCRIBE_ATTEMPTS = 4;
const RETRY_BASE_MS = 800;

/** El topic interno del SDK puede llevar prefijo `realtime:`. */
export function normalizeChannelTopic(topic) {
  return (topic ?? "").replace(/^realtime:/, "");
}

export async function removeChannelSafe(supabase, channel) {
  if (!supabase || !channel) return;
  try {
    await supabase.removeChannel(channel);
  } catch {
    // Canal ya removido o en proceso de cierre.
  }
}

export async function removeTopicChannel(supabase, topic) {
  const normalized = normalizeChannelTopic(topic);
  const channels = supabase.getChannels?.() ?? [];
  for (const ch of channels) {
    if (normalizeChannelTopic(ch.topic) === normalized) {
      await removeChannelSafe(supabase, ch);
    }
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ensureRealtimeReady(supabase, accessToken, maxWaitMs = 10_000) {
  if (accessToken) {
    await supabase.realtime.setAuth(accessToken);
  }
  const rt = supabase.realtime;
  if (!rt.isConnected()) {
    rt.connect();
  }
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    if (rt.isConnected() && rt.accessTokenValue) return true;
    await delay(50);
  }
  return Boolean(rt.isConnected() && rt.accessTokenValue);
}

async function subscribeWithRetry(supabase, topic, buildChannel, onSubscribed) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_SUBSCRIBE_ATTEMPTS; attempt += 1) {
    await removeTopicChannel(supabase, topic);
    const ch = buildChannel();

    const result = await new Promise((resolve) => {
      let settled = false;
      const finish = (payload) => {
        if (settled) return;
        settled = true;
        resolve(payload);
      };

      ch.subscribe(async (status, err) => {
        if (status === "SUBSCRIBED") {
          try {
            if (onSubscribed) await onSubscribed(ch);
          } catch (e) {
            lastError = e;
            finish({ ok: false, channel: null, error: e });
            return;
          }
          finish({ ok: true, channel: ch, error: null });
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          lastError = err ?? new Error(status);
          console.warn("[presence] Suscripción fallida:", topic, status, err);
          await removeChannelSafe(supabase, ch);
          finish({ ok: false, channel: null, error: lastError });
        }
      });
    });

    if (result.ok) return result;

    if (attempt < MAX_SUBSCRIBE_ATTEMPTS) {
      await delay(RETRY_BASE_MS * attempt);
      await ensureRealtimeReady(supabase, supabase.realtime.accessTokenValue);
    }
  }

  return { ok: false, channel: null, error: lastError };
}

export async function subscribePeerPresence(supabase, peerId, setUserOnline) {
  const topic = presenceTopic(peerId);

  const buildChannel = () => {
    const ch = supabase.channel(topic, { config: { private: true } });
    const syncPresence = () => {
      setUserOnline(peerId, channelHasPresence(ch.presenceState()));
    };
    ch
      .on("presence", { event: "sync" }, syncPresence)
      .on("presence", { event: "join" }, syncPresence)
      .on("presence", { event: "leave" }, () => setUserOnline(peerId, false));
    return ch;
  };

  const { ok, channel } = await subscribeWithRetry(supabase, topic, buildChannel, (ch) => {
    const syncPresence = () => {
      setUserOnline(peerId, channelHasPresence(ch.presenceState()));
    };
    syncPresence();
  });

  return ok ? channel : null;
}

export async function subscribeOwnPresence(supabase, userId) {
  const topic = presenceTopic(userId);

  const buildChannel = () => supabase.channel(topic, {
    config: { private: true, presence: { key: userId } },
  });

  const { ok, channel, error } = await subscribeWithRetry(
    supabase,
    topic,
    buildChannel,
    async (ch) => {
      await ch.track({ online_at: new Date().toISOString() });
    },
  );

  if (!ok) throw error ?? new Error("Canal propio no autorizado");
  return channel;
}

export function startPresenceHeartbeat(channel) {
  if (!channel) return () => {};

  const tick = async () => {
    try {
      await channel.track({ online_at: new Date().toISOString() });
    } catch {
      // Socket reconectando.
    }
  };

  const id = window.setInterval(tick, HEARTBEAT_MS);
  return () => window.clearInterval(id);
}

export async function subscribePeersBatch(supabase, peerIds, setUserOnline, concurrency = 6) {
  const results = new Map();
  const queue = [...peerIds];

  async function worker() {
    while (queue.length > 0) {
      const peerId = queue.shift();
      if (!peerId) return;
      const ch = await subscribePeerPresence(supabase, peerId, setUserOnline);
      if (ch) results.set(peerId, ch);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, peerIds.length || 1) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
