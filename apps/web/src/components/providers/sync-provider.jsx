import { useEffect, useRef } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isEmptyDb, normalizeIds } from "@/lib/data/mappers";
import { pullViaApi, reconcileViaApi } from "@/lib/sync-api.js";
import { loadDatabase } from "@/lib/storage/local-storage-adapter";
import { STORAGE_KEY } from "@/lib/storage/keys";
import { emptyDatabase } from "@/lib/storage/types";
import { watchSession } from "@/lib/session-api.js";
import { registerSyncRefresh, unregisterSyncRefresh } from "@/lib/sync-refresh.js";
import { registerSyncPush, unregisterSyncPush } from "@/lib/sync-outbound.js";
import {
  ensureDashboardDataRealtime,
  isDashboardRealtimeHealthy,
  startDashboardDataRealtime,
  stopDashboardDataRealtime,
} from "@/lib/dashboard-data-realtime.js";
import { isOutboundSyncSuspended } from "@/lib/sync-suspend.js";
import { localNeedsOutboundPush, mergeSyncDatabases } from "@/lib/sync-merge.js";
import {
  emptyPendingDeletes,
  hasPendingDeletes,
  mergePendingDeletes,
} from "@/lib/sync-pending-deletes.js";
import {
  clearOutboxAck,
  isOutboxDirty,
  markOutboxDirty,
} from "@/lib/sync-outbox.js";
import { recoverLocalBlobToCloud } from "@/lib/recover-local-prospects.js";
import { alignWorkspaceWithServer } from "@/lib/workspace-align.js";
import { maybeRequestReminderDigest, maybeFlushScheduledReminders, startScheduledReminderFlushLoop } from "@/lib/reminder-digest.js";
import { useDbStore } from "@/stores/db-store";
import { useSyncStore } from "@/stores/sync-store";
import { Toaster } from "@/components/ui/toaster";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const ACCOUNT_KEY = "sts4_account";
const DEBOUNCE_MS = 1200;
const RESUME_PULL_COOLDOWN_MS = 5_000;
const RECOVERY_COOLDOWN_MS = 15_000;

function markDirty(reason) {
  markOutboxDirty(reason);
  useSyncStore.getState().setPendingOutbound(true);
}

function ackClean() {
  clearOutboxAck();
  useSyncStore.getState().setPendingOutbound(false);
}

export function SyncProvider({ children }) {
  const userIdRef = useRef(null);
  const workspaceIdRef = useRef(null);
  const suspendRef = useRef(false);
  const enabledRef = useRef(false);
  const initedForRef = useRef(null);
  const timerRef = useRef(null);
  const lastResumePullAtRef = useRef(0);
  const refreshInFlightRef = useRef(false);
  const pushInFlightRef = useRef(false);
  const lastRecoveryAtRef = useRef(0);
  const stopFlushLoopRef = useRef(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      useSyncStore.getState().setStatus("disabled");
      return;
    }

    useSyncStore.getState().refreshPendingFromOutbox();

    const applyRemote = (db, { clearPendingDeletes = false } = {}) => {
      if (!db || typeof db !== "object") return;
      const local = useDbStore.getState().db;
      const localSettings = local.settings;
      const pending = clearPendingDeletes
        ? emptyPendingDeletes()
        : mergePendingDeletes(local.pendingDeletes, db.pendingDeletes);
      suspendRef.current = true;
      useDbStore.getState().replaceDb({
        ...db,
        settings: { ...(db.settings || {}), ...localSettings },
        pendingDeletes: pending,
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
      if (pushInFlightRef.current) return;
      pushInFlightRef.current = true;
      useSyncStore.getState().setStatus("syncing");
      try {
        const remote = await reconcileViaApi(useDbStore.getState().db);
        if (remote) applyRemote(remote, { clearPendingDeletes: true });
        ackClean();
        useSyncStore.getState().setSynced();
      } catch (err) {
        markDirty("reconcile-error");
        useSyncStore.getState().setStatus("error", err instanceof Error ? err.message : String(err));
      } finally {
        pushInFlightRef.current = false;
      }
    };

    const scheduleSync = () => {
      markDirty("mutation");
      if (!enabledRef.current) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void doReconcile();
      }, DEBOUNCE_MS);
    };

    const flushOutbound = async () => {
      markDirty("flush");
      if (!enabledRef.current) return;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      await doReconcile();
    };

    const runLocalRecovery = async (opts = {}) => {
      const force = opts.force === true;
      if (!enabledRef.current) return null;
      if (typeof navigator !== "undefined" && !navigator.onLine) return null;
      const now = Date.now();
      if (!force && now - lastRecoveryAtRef.current < RECOVERY_COOLDOWN_MS) return null;
      lastRecoveryAtRef.current = now;
      useSyncStore.getState().setStatus("syncing");
      try {
        const result = await recoverLocalBlobToCloud();
        if (result.reconciled) ackClean();
        else if (result.localOnlyIds?.length || result.failed?.length || isOutboxDirty()) {
          markDirty("recovery-pending");
        }
        if (result.error && !result.reconciled) {
          useSyncStore.getState().setStatus("error", result.error);
        } else {
          useSyncStore.getState().setSynced();
        }
        return result;
      } catch (err) {
        markDirty("recovery-error");
        useSyncStore.getState().setStatus(
          "error",
          err instanceof Error ? err.message : String(err),
        );
        return null;
      }
    };

    /**
     * @param {{ force?: boolean, reason?: string }} [opts]
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

      const hadPendingOutbound = !!timerRef.current || isOutboxDirty();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      try {
        useSyncStore.getState().setStatus("syncing");
        const localBefore = useDbStore.getState().db;
        const cloudDb = await pullViaApi();
        let needsPush =
          hadPendingOutbound
          || isOutboxDirty()
          || hasPendingDeletes(localBefore);

        if (cloudDb) {
          const local = useDbStore.getState().db;
          needsPush =
            needsPush
            || isOutboxDirty()
            || localNeedsOutboundPush(local, cloudDb);
          const merged = mergeSyncDatabases(local, cloudDb, {
            localSettings: local.settings,
          });
          suspendRef.current = true;
          useDbStore.getState().replaceDb(merged);
          suspendRef.current = false;
        }

        if (needsPush || isOutboxDirty() || hasPendingDeletes(useDbStore.getState().db)) {
          await doReconcile();
        } else {
          useSyncStore.getState().setSynced();
        }
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
    registerSyncPush(flushOutbound);

    const onWorkspaceChanged = () => {
      void refreshInbound({ force: true, reason: "workspace:changed" });
    };
    window.addEventListener("workspace:changed", onWorkspaceChanged);

    const startRealtime = (userId) => {
      void startDashboardDataRealtime(userId, { workspaceId: workspaceIdRef.current }).then(() => {
        if (!isDashboardRealtimeHealthy()) {
          setTimeout(() => {
            void ensureDashboardDataRealtime(userId, {
              force: true,
              workspaceId: workspaceIdRef.current,
            });
          }, 2500);
        }
      });
    };

    const initForUser = async (userId) => {
      if (initedForRef.current === userId) return;
      initedForRef.current = userId;
      userIdRef.current = userId;
      useSyncStore.getState().setStatus("loading");
      useSyncStore.getState().refreshPendingFromOutbox();

      const account = typeof window !== "undefined" ? localStorage.getItem(ACCOUNT_KEY) : null;
      let localDb = loadDatabase();

      let cloudDb;
      try {
        cloudDb = await pullViaApi();
      } catch (err) {
        enabledRef.current = true;
        localDb = loadDatabase();
        const canPushLocal =
          (account === userId || !account) && (!isEmptyDb(localDb) || isOutboxDirty());
        if (canPushLocal) {
          try {
            const { db: norm } = normalizeIds(localDb);
            const remote = await reconcileViaApi(norm);
            if (remote) applyRemote(remote, { clearPendingDeletes: true });
            else applyRemote(norm);
            ackClean();
            localStorage.setItem(ACCOUNT_KEY, userId);
            useSyncStore.getState().setSynced();
            await runLocalRecovery({ force: true, reason: "init-offline-push" });
            startRealtime(userId);
            return;
          } catch (syncErr) {
            markDirty("init-offline-error");
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

      localDb = useDbStore.getState().db;
      if (isEmptyDb(localDb)) localDb = loadDatabase();

      if (!isEmptyDb(cloudDb)) {
        const merged = mergeSyncDatabases(localDb, cloudDb, {
          localSettings: localDb.settings,
        });
        applyRemote(merged, { clearPendingDeletes: !hasPendingDeletes(localDb) });
        localStorage.setItem(ACCOUNT_KEY, userId);
        const mustPush =
          isOutboxDirty()
          || localNeedsOutboundPush(localDb, cloudDb)
          || hasPendingDeletes(useDbStore.getState().db);
        enabledRef.current = true;
        if (mustPush) {
          await doReconcile();
        } else {
          useSyncStore.getState().setSynced();
        }
      } else if (account === userId) {
        const { db: norm } = normalizeIds(localDb);
        applyRemote(norm);
        enabledRef.current = true;
        if (!isEmptyDb(norm) || isOutboxDirty()) {
          await doReconcile();
        } else {
          useSyncStore.getState().setSynced();
        }
      } else if (!account && !isEmptyDb(localDb)) {
        const { db: norm } = normalizeIds(localDb);
        applyRemote(norm);
        enabledRef.current = true;
        await doReconcile();
        localStorage.setItem(ACCOUNT_KEY, userId);
      } else {
        applyRemote(emptyDatabase(), { clearPendingDeletes: true });
        localStorage.setItem(ACCOUNT_KEY, userId);
        enabledRef.current = true;
        useSyncStore.getState().setSynced();
      }

      enabledRef.current = true;
      lastResumePullAtRef.current = Date.now();
      if (isOutboxDirty()) {
        await doReconcile();
      }
      await runLocalRecovery({ force: true, reason: "init" });
      startRealtime(userId);
      maybeRequestReminderDigest();
      if (typeof stopFlushLoopRef.current === "function") stopFlushLoopRef.current();
      stopFlushLoopRef.current = startScheduledReminderFlushLoop();
    };

    const stopForUser = () => {
      enabledRef.current = false;
      initedForRef.current = null;
      userIdRef.current = null;
      lastResumePullAtRef.current = 0;
      if (typeof stopFlushLoopRef.current === "function") {
        stopFlushLoopRef.current();
        stopFlushLoopRef.current = null;
      }
      void stopDashboardDataRealtime();
      useSyncStore.getState().setStatus("disabled");
      useSyncStore.getState().refreshPendingFromOutbox();
    };

    const unsubSession = watchSession((session) => {
      const userId = session?.user?.id;
      workspaceIdRef.current = session?.workspace_activo_id || session?.workspace_activo?.id || null;
      if (userId) void initForUser(userId);
      else stopForUser();
    });

    const unsub = useDbStore.subscribe((state, prev) => {
      if (state.db === prev.db) return;
      if (suspendRef.current) return;
      if (isOutboundSyncSuspended()) return;
      markDirty("db-mutation");
      if (!enabledRef.current) return;
      scheduleSync();
    });

    const realignThenSync = async (reason) => {
      const aligned = await alignWorkspaceWithServer(workspaceIdRef.current);
      if (aligned.workspaceId) workspaceIdRef.current = aligned.workspaceId;
      if (aligned.changed) {
        const uid = userIdRef.current;
        if (uid) {
          await stopDashboardDataRealtime();
          await startDashboardDataRealtime(uid, {
            force: true,
            workspaceId: workspaceIdRef.current,
          });
        }
      }
      await runLocalRecovery({ force: reason === "online" || reason === "init", reason });
      await refreshInbound({ reason, force: true });
    };

    const onOnline = () => {
      lastResumePullAtRef.current = 0;
      const uid = userIdRef.current;
      if (uid) {
        void ensureDashboardDataRealtime(uid, {
          force: true,
          workspaceId: workspaceIdRef.current,
        });
      }
      void realignThenSync("online");
    };

    const onAppForeground = () => {
      if (document.visibilityState && document.visibilityState !== "visible") return;
      const uid = userIdRef.current;
      if (!uid || !enabledRef.current) return;
      void ensureDashboardDataRealtime(uid, {
        force: true,
        workspaceId: workspaceIdRef.current,
      });
      void realignThenSync("foreground");
      maybeRequestReminderDigest();
      maybeFlushScheduledReminders({ force: true });
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") onAppForeground();
    };

    const onFocus = () => {
      onAppForeground();
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
          pendingDeletes: parsed.pendingDeletes ?? emptyPendingDeletes(),
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
    window.addEventListener("pageshow", onFocus);
    window.addEventListener("storage", onStorage);
    window.addEventListener("auth:resume", onFocus);

    return () => {
      unregisterSyncRefresh(refreshInbound);
      unregisterSyncPush(flushOutbound);
      window.removeEventListener("workspace:changed", onWorkspaceChanged);
      void stopDashboardDataRealtime();
      if (typeof stopFlushLoopRef.current === "function") {
        stopFlushLoopRef.current();
        stopFlushLoopRef.current = null;
      }
      unsubSession();
      unsub();
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onFocus);
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
