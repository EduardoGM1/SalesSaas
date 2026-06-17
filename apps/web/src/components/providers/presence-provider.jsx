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

export function PresenceProvider({ children }) {
  const [online, setOnline] = useState({});
  const [lastSeen, setLastSeen] = useState({});
  const supabaseRef = useRef(null);
  const userIdRef = useRef(null);
  const ownChannelRef = useRef(null);
  const peerChannelsRef = useRef(new Map());

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
    for (const [, ch] of peerChannelsRef.current) {
      try { await sb?.removeChannel(ch); } catch { /* ignore */ }
    }
    peerChannelsRef.current.clear();
  }, []);

  const subscribeToContacts = useCallback(async (supabase, contacts) => {
    await removePeerChannels();
    for (const peer of contacts) {
      if (!peer?.id) continue;
      const peerId = peer.id;
      const ch = supabase.channel(presenceTopic(peerId), { config: { private: true } });
      const syncPresence = () => {
        setUserOnline(peerId, channelHasPresence(ch.presenceState()));
      };
      ch.on("presence", { event: "sync" }, syncPresence);
      ch.on("presence", { event: "join" }, syncPresence);
      ch.on("presence", { event: "leave" }, () => setUserOnline(peerId, false));
      ch.subscribe();
      peerChannelsRef.current.set(peerId, ch);
    }
  }, [removePeerChannels, setUserOnline]);

  const loadContacts = useCallback(async (supabase) => {
    const connections = await networkApi.listConnections();
    const contacts = connections
      .filter((c) => c.status === "accepted")
      .map((c) => c.peer)
      .filter(Boolean);
    seedLastSeen(contacts);
    await subscribeToContacts(supabase, contacts);
    return contacts;
  }, [seedLastSeen, subscribeToContacts]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return undefined;

    let active = true;

    const teardown = async () => {
      const sb = supabaseRef.current;
      try { await ownChannelRef.current?.untrack(); } catch { /* ignore */ }
      if (ownChannelRef.current && sb) {
        try { await sb.removeChannel(ownChannelRef.current); } catch { /* ignore */ }
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

        const myChannel = supabase.channel(presenceTopic(user.id), {
          config: { private: true, presence: { key: user.id } },
        });
        myChannel.subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await myChannel.track({ online_at: new Date().toISOString() });
          }
        });
        ownChannelRef.current = myChannel;

        await loadContacts(supabase);
      } catch {
        // Presencia opcional: la red sigue funcionando sin Realtime.
      }
    };

    setup();

    const handlePageLeave = () => markPresenceOffline();
    const handleContactsChanged = () => {
      const sb = supabaseRef.current;
      if (sb) loadContacts(sb);
    };

    window.addEventListener("pagehide", handlePageLeave);
    window.addEventListener("beforeunload", handlePageLeave);
    window.addEventListener("network:contacts-changed", handleContactsChanged);

    return () => {
      active = false;
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
