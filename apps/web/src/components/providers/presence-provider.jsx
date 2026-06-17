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
  subscribePeerPresence,
} from "@/lib/presence/realtime.js";

const PresenceContext = createContext({
  online: {},
  lastSeen: {},
  seedLastSeen: () => {},
});

const RESUBSCRIBE_COOLDOWN_MS = 60_000;
const CONTACTS_DEBOUNCE_MS = 1_500;
const PEER_RETRY_BASE_MS = 10_000;
const PEER_RETRY_MAX_MS = 300_000;
const MAX_PEER_SUBSCRIBES_PER_PASS = 8;

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
  const peerRetryRef = useRef(new Map());
  const presenceLockRef = useRef(null);
  const contactsChangedTimerRef = useRef(null);
  const contactsSyncingRef = useRef(false);
  const authSubscriptionRef = useRef(null);
  const heartbeatStopRef = useRef(null);
  const resubscribeTimerRef = useRef(null);
  const resubscribingRef = useRef(false);
  const lastResubscribeAtRef = useRef(0);
  const hiddenAtRef = useRef(null);
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

  const markPeerRetry = useCallback((peerId) => {
    const prev = peerRetryRef.current.get(peerId) ?? { attempts: 0, retryAfter: 0 };
    const attempts = prev.attempts + 1;
    const backoff = Math.min(PEER_RETRY_MAX_MS, PEER_RETRY_BASE_MS * (2 ** (attempts - 1)));
    peerRetryRef.current.set(peerId, {
      attempts,
      retryAfter: Date.now() + backoff,
    });
  }, []);

  const clearPeerRetry = useCallback((peerId) => {
    peerRetryRef.current.delete(peerId);
  }, []);

  const canRetryPeer = useCallback((peerId) => {
    const entry = peerRetryRef.current.get(peerId);
    if (!entry) return true;
    return Date.now() >= entry.retryAfter;
  }, []);

  const subscribeToContacts = useCallback(async (supabase, contacts, selfId) => {
    const peerIds = new Set(
      contacts
        .map((p) => p?.id)
        .filter((id) => id && id !== selfId),
    );

    for (const [peerId, ch] of [...peerChannelsRef.current.entries()]) {
      if (!peerIds.has(peerId)) {
        peerChannelsRef.current.delete(peerId);
        clearPeerRetry(peerId);
        setUserOnline(peerId, false);
        await removeChannelSafe(supabase, ch);
      }
    }

    const pending = [...peerIds].filter(
      (id) => !peerChannelsRef.current.has(id) && canRetryPeer(id),
    );

    let subscribedThisPass = 0;
    for (const peerId of pending) {
      if (subscribedThisPass >= MAX_PEER_SUBSCRIBES_PER_PASS) break;
      subscribedThisPass += 1;
      const ch = await subscribePeerPresence(supabase, peerId, setUserOnline);
      if (ch) {
        peerChannelsRef.current.set(peerId, ch);
        clearPeerRetry(peerId);
      } else {
        markPeerRetry(peerId);
      }
    }
  }, [canRetryPeer, clearPeerRetry, markPeerRetry, setUserOnline]);

  const loadContacts = useCallback(async (supabase) => {
    if (contactsSyncingRef.current) return null;
    contactsSyncingRef.current = true;
    try {
      return await runExclusive(presenceLockRef, async () => {
        const connections = await networkApi.listConnections();
        const contacts = connections
          .filter((c) => c.status === "accepted")
          .map((c) => c.peer)
          .filter(Boolean);
        seedLastSeen(contacts);
        await subscribeToContacts(supabase, contacts, userIdRef.current);
        return contacts;
      });
    } finally {
      contactsSyncingRef.current = false;
    }
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

  const fullResubscribe = useCallback(async (force = false) => {
    const supabase = supabaseRef.current;
    const userId = userIdRef.current;
    if (!supabase || !userId || !activeRef.current) return;

    const now = Date.now();
    if (!force && now - lastResubscribeAtRef.current < RESUBSCRIBE_COOLDOWN_MS) return;
    if (resubscribingRef.current) return;

    resubscribingRef.current = true;
    lastResubscribeAtRef.current = now;

    try {
      const session = await resolveSession(supabase);
      primeRealtimeAuth(session.access_token);
      await ensureRealtimeReady(supabase, session.access_token);

      if (!ownChannelRef.current) {
        await startOwnChannel(supabase, userId);
      }

      await loadContacts(supabase);
    } catch (err) {
      console.warn("[presence] Re-suscripción fallida:", err);
    } finally {
      resubscribingRef.current = false;
    }
  }, [loadContacts, startOwnChannel]);

  const scheduleResubscribe = useCallback((force = false) => {
    if (resubscribeTimerRef.current) {
      window.clearTimeout(resubscribeTimerRef.current);
    }
    resubscribeTimerRef.current = window.setTimeout(() => {
      resubscribeTimerRef.current = null;
      fullResubscribe(force);
    }, 1_200);
  }, [fullResubscribe]);

  const loadContactsRef = useRef(loadContacts);
  const startOwnChannelRef = useRef(startOwnChannel);
  const scheduleResubscribeRef = useRef(scheduleResubscribe);
  const removePeerChannelsRef = useRef(removePeerChannels);

  loadContactsRef.current = loadContacts;
  startOwnChannelRef.current = startOwnChannel;
  scheduleResubscribeRef.current = scheduleResubscribe;
  removePeerChannelsRef.current = removePeerChannels;

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
        peerRetryRef.current.clear();
        await removePeerChannelsRef.current();
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
            if (!nextSession?.access_token) return;
            primeRealtimeAuth(nextSession.access_token);
            supabase.realtime.setAuth(nextSession.access_token);
            // Refrescar token no requiere re-suscribir todos los canales.
            if (event === "SIGNED_IN") {
              scheduleResubscribeRef.current(true);
            }
          }).data.subscription;

          const ready = await ensureRealtimeReady(supabase, session.access_token);
          if (!ready) {
            scheduleResubscribeRef.current(true);
            return;
          }

          const { data: { user } } = await supabase.auth.getUser();
          if (!user?.id || !activeRef.current) return;
          userIdRef.current = user.id;

          await startOwnChannelRef.current(supabase, user.id);
        });

        const sb = supabaseRef.current;
        if (sb && activeRef.current) await loadContactsRef.current(sb);
      } catch (err) {
        console.warn("[presence] No se pudo iniciar Realtime Presence:", err);
        scheduleResubscribeRef.current(true);
      }
    };

    setup();

    const handlePageLeave = () => markPresenceOffline();

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }
      const hiddenFor = hiddenAtRef.current
        ? Date.now() - hiddenAtRef.current
        : RESUBSCRIBE_COOLDOWN_MS;
      hiddenAtRef.current = null;
      if (hiddenFor >= 30_000 && !ownChannelRef.current) {
        scheduleResubscribeRef.current();
      } else if (hiddenFor >= 30_000) {
        const sb = supabaseRef.current;
        if (sb) loadContactsRef.current(sb);
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
        loadContactsRef.current(sb);
      }, CONTACTS_DEBOUNCE_MS);
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
  }, []);

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
