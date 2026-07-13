import { useEffect, useRef } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isEmptyDb, normalizeIds } from "@/lib/data/mappers";
import { pullViaApi, reconcileViaApi } from "@/lib/sync-api.js";
import { loadDatabase } from "@/lib/storage/local-storage-adapter";
import { STORAGE_KEY } from "@/lib/storage/keys";
import { emptyDatabase } from "@/lib/storage/types";
import { watchSession } from "@/lib/session-api.js";
import { registerSyncRefresh, unregisterSyncRefresh } from "@/lib/sync-refresh.js";
import {
  startDashboardDataRealtime,
  stopDashboardDataRealtime,
} from "@/lib/dashboard-data-realtime.js";
import { useDbStore } from "@/stores/db-store";
import { useSyncStore } from "@/stores/sync-store";
import { Toaster } from "@/components/ui/toaster";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const ACCOUNT_KEY = "sts4_account";
const DEBOUNCE_MS = 1200;
/** Evita storms de pull al cambiar de app / foco. */
const RESUME_PULL_COOLDOWN_MS = 45_000;

export function SyncProvider({ children }) {
  const userIdRef = useRef(null);
  const suspendRef = useRef(false);
  const enabledRef = useRef(false);
  const initedForRef = useRef(null);
  const timerRef = useRef(null);
  const lastResumePullAtRef = useRef(0);
  const refreshInFlightRef = useRef(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      useSyncStore.getState().setStatus("disabled");
      return;
    }

    const applyRemote = (db) => {
      if (!db || typeof db !== "object") return;
      const localSettings = useDbStore.getState().db.settings;
      suspendRef.current = true;
      useDbStore.getState().replaceDb({
        ...db,
        settings: { ...db.settings, ...localSettings },
      });
      suspendRef.current = false;
    };

    const doReconcile = async () => {
      const uid = userIdRef.current;
      if (!uid || !enabledRef.current) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        useSyncStore.getState().setStatus("offline");
        return;
      }
      useSyncStore.getState().setStatus("syncing");
      try {
        const remote = await reconcileViaApi(useDbStore.getState().db);
        if (remote) applyRemote(remote);
        useSyncStore.getState().setSynced();
      } catch (err) {
        useSyncStore.getState().setStatus("error", err instanceof Error ? err.message : String(err));
      }
    };

    const scheduleSync = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void doReconcile();
      }, DEBOUNCE_MS);
    };

    /**
     * @param {{ force?: boolean, reason?: string }} [opts]
     * force: Realtime / invalidación — ignora cooldown de resume.
     */
    const refreshInbound = async (opts = {}) => {
      const force = opts.force === true;
      const uid = userIdRef.current;
      if (!uid || !enabledRef.current || refreshInFlightRef.current) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        useSyncStore.getState().setStatus("offline");
        return;
      }

      const now = Date.now();
      if (!force && now - lastResumePullAtRef.current < RESUME_PULL_COOLDOWN_MS) return;
      lastResumePullAtRef.current = now;
      refreshInFlightRef.current = true;

      try {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
          await doReconcile();
          return;
        }

        useSyncStore.getState().setStatus("syncing");
        const cloudDb = await pullViaApi();
        if (cloudDb) applyRemote(cloudDb);
        useSyncStore.getState().setSynced();
      } catch (err) {
        useSyncStore.getState().setStatus(
          "error",
          err instanceof Error ? err.message : String(err),
        );
      } finally {
        refreshInFlightRef.current = false;
      }
    };

    registerSyncRefresh(refreshInbound);

    const initForUser = async (userId) => {
      if (initedForRef.current === userId) return;
      initedForRef.current = userId;
      userIdRef.current = userId;
      useSyncStore.getState().setStatus("loading");

      const localDb = loadDatabase();
      const account = typeof window !== "undefined" ? localStorage.getItem(ACCOUNT_KEY) : null;

      let cloudDb;
      try {
        cloudDb = await pullViaApi();
      } catch (err) {
        enabledRef.current = true;
        const canPushLocal =
          (account === userId || !account) && !isEmptyDb(localDb);
        if (canPushLocal) {
          try {
            const { db: norm } = normalizeIds(localDb);
            const remote = await reconcileViaApi(norm);
            if (remote) applyRemote(remote);
            else applyRemote(norm);
            localStorage.setItem(ACCOUNT_KEY, userId);
            useSyncStore.getState().setSynced();
            void startDashboardDataRealtime(userId);
            return;
          } catch (syncErr) {
            useSyncStore.getState().setStatus(
              "error",
              syncErr instanceof Error ? syncErr.message : String(syncErr),
            );
            return;
          }
        }
        useSyncStore.getState().setStatus("offline", err instanceof Error ? err.message : undefined);
        return;
      }

      if (!isEmptyDb(cloudDb)) {
        applyRemote(cloudDb);
        localStorage.setItem(ACCOUNT_KEY, userId);
        useSyncStore.getState().setSynced();
      } else if (account === userId) {
        const { db: norm } = normalizeIds(localDb);
        applyRemote(norm);
        if (!isEmptyDb(norm)) {
          const remote = await reconcileViaApi(norm);
          if (remote) applyRemote(remote);
        }
        useSyncStore.getState().setSynced();
      } else if (!account && !isEmptyDb(localDb)) {
        const { db: norm } = normalizeIds(localDb);
        applyRemote(norm);
        const remote = await reconcileViaApi(norm);
        if (remote) applyRemote(remote);
        localStorage.setItem(ACCOUNT_KEY, userId);
        useSyncStore.getState().setSynced();
      } else {
        applyRemote(emptyDatabase());
        localStorage.setItem(ACCOUNT_KEY, userId);
        useSyncStore.getState().setSynced();
      }

      enabledRef.current = true;
      lastResumePullAtRef.current = Date.now();
      void startDashboardDataRealtime(userId);
    };

    const stopForUser = () => {
      enabledRef.current = false;
      initedForRef.current = null;
      userIdRef.current = null;
      lastResumePullAtRef.current = 0;
      void stopDashboardDataRealtime();
      useSyncStore.getState().setStatus("disabled");
    };

    const unsubSession = watchSession((session) => {
      const userId = session?.user?.id;
      if (userId) void initForUser(userId);
      else stopForUser();
    });

    const unsub = useDbStore.subscribe((state, prev) => {
      if (state.db === prev.db) return;
      if (suspendRef.current || !enabledRef.current) return;
      scheduleSync();
    });

    const onOnline = () => {
      lastResumePullAtRef.current = 0;
      void refreshInbound({ reason: "online" });
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshInbound({ reason: "visibility" });
      }
    };

    const onFocus = () => {
      void refreshInbound({ reason: "focus" });
    };

    const onStorage = (event) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      if (!enabledRef.current || suspendRef.current) return;
      try {
        const parsed = JSON.parse(event.newValue);
        if (!parsed || typeof parsed !== "object") return;
        const next = {
          clients: parsed.clients ?? {},
          libre: parsed.libre ?? {},
          cal: parsed.cal ?? {},
          goals: parsed.goals ?? {},
          sales: parsed.sales ?? {},
          userActivities: parsed.userActivities ?? [],
          settings: parsed.settings ?? emptyDatabase().settings,
        };
        suspendRef.current = true;
        useDbStore.getState().replaceDb(next);
        suspendRef.current = false;
      } catch {
        // ignore
      }
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    window.addEventListener("auth:resume", onFocus);

    return () => {
      unregisterSyncRefresh(refreshInbound);
      void stopDashboardDataRealtime();
      unsubSession();
      unsub();
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("auth:resume", onFocus);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <>
      {children}
      <Toaster />
      <ConfirmDialog />
    </>
  );
}
