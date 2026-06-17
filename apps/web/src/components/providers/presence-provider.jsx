import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { networkApi } from "@/lib/network-api.js";
import { fetchRealtimeSession, markPresenceOffline } from "@/lib/presence-api.js";
import { channelHasPresence, presenceTopic } from "@/lib/presence/topics.js";

const PresenceContext = createContext({
  online: {},
  lastSeen: {},
  seedLastSeen: () => {},
});

async function removeChannelSafe(supabase, channel) {
  if (!supabase || !channel) return;
  try {
    await supabase.removeChannel(channel);
  } catch {
    // Canal ya removido o en proceso de cierre.
  }
}

/** Elimina cualquier canal activo con el mismo topic antes de crear uno nuevo. */
async function removeTopicChannel(supabase, topic) {
  const channels = supabase.getChannels?.() ?? [];
  const matches = channels.filter((ch) => ch.topic === topic);
  await Promise.all(matches.map((ch) => removeChannelSafe(supabase, ch)));
}

function subscribePeerPresence(supabase, peerId, setUserOnline) {
  const topic = presenceTopic(peerId);
  const ch = supabase.channel(topic, { config: { private: true } });

  const syncPresence = () => {
    setUserOnline(peerId, channelHasPresence(ch.presenceState()));
  };

  return new Promise((resolve) => {
    ch
      .on("presence", { event: "sync" }, syncPresence)
      .on("presence", { event: "join" }, syncPresence)
      .on("presence", { event: "leave" }, () => setUserOnline(peerId, false))
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[presence] Canal no autorizado o error:", topic, status);
        }
        if (status === "SUBSCRIBED") syncPresence();
        if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          resolve(ch);
        }
      });
  });
}

export function PresenceProvider({ children }) {
  const [online, setOnline] = useState({});
  const [lastSeen, setLastSeen] = useState({});
  const supabaseRef = useRef(null);
  const userIdRef = useRef(null);
  const ownChannelRef = useRef(null);
  const peerChannelsRef = useRef(new Map());
  const contactsLoadRef = useRef(null);
  const contactsChangedTimerRef = useRef(null);

  const seedLastSeen = useCallback((peers) => {
    if (!peers?.length) return;
    setLastSeen((prev) => {
      const next = { ...prev };
      for (const p of peers) {
        if (p?.id && p.last_seen_at) next[p.id] = p.last_seen_at;
      }
      return next;
    });
  }, []);

  const setUserOnline = useCallback((userId, isOnline) => {
    setOnline((prev) => {
      if (!!prev[userId] === isOnline) return prev;
      return { ...prev, [userId]: isOnline };
    });
    if (!isOnline) {
      const now = new Date().toISOString();
      setLastSeen((prev) => ({ ...prev, [userId]: now }));
    }
  }, []);

  const removePeerChannels = useCallback(async () => {
    const sb = supabaseRef.current;
    const entries = [...peerChannelsRef.current.entries()];
    peerChannelsRef.current.clear();
    await Promise.all(entries.map(([, ch]) => removeChannelSafe(sb, ch)));
  }, []);

  const subscribeToContacts = useCallback(async (supabase, contacts, selfId) => {
    await removePeerChannels();

    const peerIds = contacts
      .map((p) => p?.id)
      .filter((id) => id && id !== selfId);

    for (const peerId of peerIds) {
      const topic = presenceTopic(peerId);
      await removeTopicChannel(supabase, topic);
      const ch = await subscribePeerPresence(supabase, peerId, setUserOnline);
      peerChannelsRef.current.set(peerId, ch);
    }
  }, [removePeerChannels, setUserOnline]);

  const loadContacts = useCallback(async (supabase) => {
    if (contactsLoadRef.current) return contactsLoadRef.current;

    const task = (async () => {
      const connections = await networkApi.listConnections();
      const contacts = connections
        .filter((c) => c.status === "accepted")
        .map((c) => c.peer)
        .filter(Boolean);
      seedLastSeen(contacts);
      await subscribeToContacts(supabase, contacts, userIdRef.current);
      return contacts;
    })();

    contactsLoadRef.current = task;
    try {
      return await task;
    } finally {
      if (contactsLoadRef.current === task) contactsLoadRef.current = null;
    }
  }, [seedLastSeen, subscribeToContacts]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return undefined;

    let active = true;

    const teardown = async () => {
      const sb = supabaseRef.current;
      try { await ownChannelRef.current?.untrack(); } catch { /* ignore */ }
      if (ownChannelRef.current && sb) {
        await removeChannelSafe(sb, ownChannelRef.current);
      }
      ownChannelRef.current = null;
      await removePeerChannels();
    };

    const setup = async () => {
      try {
        const rt = await fetchRealtimeSession();
        if (!active) return;

        const supabase = createClient();
        supabaseRef.current = supabase;
        const { error } = await supabase.auth.setSession({
          access_token: rt.access_token,
          refresh_token: rt.refresh_token,
        });
        if (error || !active) return;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id || !active) return;
        userIdRef.current = user.id;

        const ownTopic = presenceTopic(user.id);
        await removeTopicChannel(supabase, ownTopic);

        const myChannel = supabase.channel(ownTopic, {
          config: { private: true, presence: { key: user.id } },
        });
        myChannel.subscribe(async (status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("[presence] Canal propio no autorizado:", ownTopic, status);
          }
          if (status === "SUBSCRIBED") {
            await myChannel.track({ online_at: new Date().toISOString() });
          }
        });
        ownChannelRef.current = myChannel;

        await loadContacts(supabase);
      } catch (err) {
        console.warn("[presence] No se pudo iniciar Realtime Presence:", err);
      }
    };

    setup();

    const handlePageLeave = () => markPresenceOffline();

    const handleContactsChanged = () => {
      const sb = supabaseRef.current;
      if (!sb) return;
      if (contactsChangedTimerRef.current) {
        window.clearTimeout(contactsChangedTimerRef.current);
      }
      contactsChangedTimerRef.current = window.setTimeout(() => {
        contactsChangedTimerRef.current = null;
        loadContacts(sb);
      }, 400);
    };

    window.addEventListener("pagehide", handlePageLeave);
    window.addEventListener("beforeunload", handlePageLeave);
    window.addEventListener("network:contacts-changed", handleContactsChanged);

    return () => {
      active = false;
      if (contactsChangedTimerRef.current) {
        window.clearTimeout(contactsChangedTimerRef.current);
      }
      window.removeEventListener("pagehide", handlePageLeave);
      window.removeEventListener("beforeunload", handlePageLeave);
      window.removeEventListener("network:contacts-changed", handleContactsChanged);
      teardown();
    };
  }, [loadContacts, removePeerChannels]);

  const value = useMemo(
    () => ({ online, lastSeen, seedLastSeen }),
    [online, lastSeen, seedLastSeen],
  );

  return (
    <PresenceContext.Provider value={value}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresenceContext() {
  return useContext(PresenceContext);
}

export function useContactPresence(userId) {
  const { online, lastSeen } = usePresenceContext();
  return {
    online: userId ? !!online[userId] : false,
    lastSeen: userId ? lastSeen[userId] || null : null,
  };
}
