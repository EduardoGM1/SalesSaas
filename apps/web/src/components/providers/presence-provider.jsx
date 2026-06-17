import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createClient, primeRealtimeAuth } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { networkApi } from "@/lib/network-api.js";
import { fetchRealtimeSession, markPresenceOffline } from "@/lib/presence-api.js";
import {
  ensureRealtimeReady,
  removeChannelSafe,
  startPresenceHeartbeat,
  subscribeOwnPresence,
  subscribePeersBatch,
} from "@/lib/presence/realtime.js";

const PresenceContext = createContext({
  online: {},
  lastSeen: {},
  seedLastSeen: () => {},
});

async function runExclusive(lockRef, fn) {
  while (lockRef.current) {
    await lockRef.current;
  }
  const task = fn();
  lockRef.current = task;
  try {
    return await task;
  } finally {
    if (lockRef.current === task) lockRef.current = null;
  }
}

async function resolveSession(supabase) {
  let { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) return session;

  const rt = await fetchRealtimeSession();
  const { error } = await supabase.auth.setSession({
    access_token: rt.access_token,
    refresh_token: rt.refresh_token,
  });
  if (error) throw error;

  ({ data: { session } } = await supabase.auth.getSession());
  if (!session?.access_token) throw new Error("Sin sesión para Realtime");
  return session;
}

export function PresenceProvider({ children }) {
  const [online, setOnline] = useState({});
  const [lastSeen, setLastSeen] = useState({});
  const supabaseRef = useRef(null);
  const userIdRef = useRef(null);
  const ownChannelRef = useRef(null);
  const peerChannelsRef = useRef(new Map());
  const presenceLockRef = useRef(null);
  const contactsChangedTimerRef = useRef(null);
  const authSubscriptionRef = useRef(null);
  const heartbeatStopRef = useRef(null);
  const resubscribeTimerRef = useRef(null);
  const activeRef = useRef(false);

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
    for (const [, ch] of entries) {
      await removeChannelSafe(sb, ch);
    }
  }, []);

  const subscribeToContacts = useCallback(async (supabase, contacts, selfId) => {
    await removePeerChannels();

    const peerIds = contacts
      .map((p) => p?.id)
      .filter((id) => id && id !== selfId);

    const channels = await subscribePeersBatch(supabase, peerIds, setUserOnline);
    peerChannelsRef.current = channels;
  }, [removePeerChannels, setUserOnline]);

  const loadContacts = useCallback(async (supabase) => {
    return runExclusive(presenceLockRef, async () => {
      const connections = await networkApi.listConnections();
      const contacts = connections
        .filter((c) => c.status === "accepted")
        .map((c) => c.peer)
        .filter(Boolean);
      seedLastSeen(contacts);
      await subscribeToContacts(supabase, contacts, userIdRef.current);
      return contacts;
    });
  }, [seedLastSeen, subscribeToContacts]);

  const startOwnChannel = useCallback(async (supabase, userId) => {
    heartbeatStopRef.current?.();
    heartbeatStopRef.current = null;

    if (ownChannelRef.current) {
      try { await ownChannelRef.current.untrack(); } catch { /* ignore */ }
      await removeChannelSafe(supabase, ownChannelRef.current);
      ownChannelRef.current = null;
    }

    const myChannel = await subscribeOwnPresence(supabase, userId);
    ownChannelRef.current = myChannel;
    heartbeatStopRef.current = startPresenceHeartbeat(myChannel);
    return myChannel;
  }, []);

  const fullResubscribe = useCallback(async () => {
    const supabase = supabaseRef.current;
    const userId = userIdRef.current;
    if (!supabase || !userId || !activeRef.current) return;

    try {
      const session = await resolveSession(supabase);
      primeRealtimeAuth(session.access_token);
      await ensureRealtimeReady(supabase, session.access_token);
      await startOwnChannel(supabase, userId);
      await loadContacts(supabase);
    } catch (err) {
      console.warn("[presence] Re-suscripción fallida:", err);
    }
  }, [loadContacts, startOwnChannel]);

  const scheduleResubscribe = useCallback(() => {
    if (resubscribeTimerRef.current) {
      window.clearTimeout(resubscribeTimerRef.current);
    }
    resubscribeTimerRef.current = window.setTimeout(() => {
      resubscribeTimerRef.current = null;
      fullResubscribe();
    }, 600);
  }, [fullResubscribe]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return undefined;

    activeRef.current = true;

    const teardown = async () => {
      markPresenceOffline();
      heartbeatStopRef.current?.();
      heartbeatStopRef.current = null;

      await runExclusive(presenceLockRef, async () => {
        const sb = supabaseRef.current;
        try { await ownChannelRef.current?.untrack(); } catch { /* ignore */ }
        if (ownChannelRef.current && sb) {
          await removeChannelSafe(sb, ownChannelRef.current);
        }
        ownChannelRef.current = null;
        await removePeerChannels();
      });
    };

    const setup = async () => {
      try {
        await runExclusive(presenceLockRef, async () => {
          const supabase = createClient();
          supabaseRef.current = supabase;

          const session = await resolveSession(supabase);
          if (!activeRef.current) return;

          primeRealtimeAuth(session.access_token);

          authSubscriptionRef.current?.unsubscribe();
          authSubscriptionRef.current = supabase.auth.onAuthStateChange((event, nextSession) => {
            if (nextSession?.access_token) {
              primeRealtimeAuth(nextSession.access_token);
              supabase.realtime.setAuth(nextSession.access_token);
              if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
                scheduleResubscribe();
              }
            }
          }).data.subscription;

          const ready = await ensureRealtimeReady(supabase, session.access_token);
          if (!ready) {
            console.warn("[presence] Realtime sin JWT/socket; reintentando…");
          }

          const { data: { user } } = await supabase.auth.getUser();
          if (!user?.id || !activeRef.current) return;
          userIdRef.current = user.id;

          await startOwnChannel(supabase, user.id);
        });

        const sb = supabaseRef.current;
        if (sb && activeRef.current) await loadContacts(sb);
      } catch (err) {
        console.warn("[presence] No se pudo iniciar Realtime Presence:", err);
      }
    };

    setup();

    const handlePageLeave = () => markPresenceOffline();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        scheduleResubscribe();
      }
    };

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
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      activeRef.current = false;
      authSubscriptionRef.current?.unsubscribe();
      authSubscriptionRef.current = null;
      if (contactsChangedTimerRef.current) {
        window.clearTimeout(contactsChangedTimerRef.current);
      }
      if (resubscribeTimerRef.current) {
        window.clearTimeout(resubscribeTimerRef.current);
      }
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageLeave);
      window.removeEventListener("beforeunload", handlePageLeave);
      window.removeEventListener("network:contacts-changed", handleContactsChanged);
      teardown();
    };
  }, [loadContacts, removePeerChannels, scheduleResubscribe, startOwnChannel]);

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
