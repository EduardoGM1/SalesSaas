import { useEffect, useRef } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isEmptyDb, normalizeIds } from "@/lib/data/mappers";
import { omitDeniedToolWrites } from "@/lib/tool-write-denial.js";
import { pullViaApi, reconcileViaApi } from "../servicios/sync-api.js";
import { loadDatabase, getActiveWorkspaceId, isCurrentWorkspaceStorageEvent } from "@/lib/storage/local-storage-adapter";
import { ACCOUNT_KEY, USER_PREFS_KEY } from "@/lib/storage/keys";
import { resetLocalCrmState } from "@/lib/local-session-reset.js";
import { applyWorkspaceLocalDatabase } from "@/lib/workspace-local-cache.js";
import { mergeSettingsForWorkspace } from "@/lib/storage/settings-scope.js";
import { emptyDatabase } from "@/lib/storage/types";
import { watchSession } from "@/lib/session-api.js";
import { registerSyncRefresh, unregisterSyncRefresh } from "../servicios/sync-refresh.js";
import { registerSyncPush, unregisterSyncPush } from "../servicios/sync-outbound.js";
import {
  ensureDashboardDataRealtime,
  isDashboardRealtimeHealthy,
  startDashboardDataRealtime,
  stopDashboardDataRealtime,
} from "@/lib/dashboard-data-realtime.js";
import { isOutboundSyncSuspended } from "../servicios/sync-suspend.js";
import { localNeedsOutboundPush, mergeSyncDatabases } from "../servicios/sync-merge.js";
import {
  emptyPendingDeletes,
  hasPendingDeletes,
  mergePendingDeletes,
} from "../servicios/sync-pending-deletes.js";
import {
  canAttemptOutboxNow,
  clearOutboxAck,
  clearOutboxBackoff,
  getOutboxState,
  isOutboxDirty,
  isOutboxOnLegacyKey,
  markOutboxDirty,
  recordOutboxFailure,
  recordOutboxRejected,
} from "../servicios/sync-outbox.js";
import { recoverLocalBlobToCloud } from "@/lib/recover-local-prospects.js";
import { alignWorkspaceWithServer } from "@/lib/workspace-align.js";
import { suspendCloudPersist } from "@/lib/cloud-persist-bridge.js";
import { hydrateProspectsFromApi } from "@/lib/prospects-persist.js";
import { maybeRequestReminderDigest, maybeFlushScheduledReminders, startScheduledReminderFlushLoop } from "@/modulos/notificaciones";
import { useDbStore } from "@/stores/db-store";
import { useSyncStore } from "./sync-store";
import { Toaster } from "@/modulos/notificaciones";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const DEBOUNCE_MS = 400;
const RESUME_PULL_COOLDOWN_MS = 5_000;
const RECOVERY_COOLDOWN_MS = 15_000;

function markDirty(reason) {
  markOutboxDirty(reason);
  useSyncStore.getState().refreshPendingFromOutbox();
}

function ackClean() {
  clearOutboxAck();
  useSyncStore.getState().refreshPendingFromOutbox();
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
  /** Si llega un refresh mientras hay otro en vuelo, reejecutar al terminar. */
  const pendingRefreshOptsRef = useRef(null);
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
      suspendCloudPersist(true);
      useDbStore.getState().replaceDb({
        ...db,
        settings: mergeSettingsForWorkspace(localSettings, db.settings, workspaceIdRef.current),
        pendingDeletes: pending,
      });
      suspendRef.current = false;
      suspendCloudPersist(false);
    };

    const scheduleBackoffTimer = () => {
      const s = getOutboxState();
      if (!s.nextAttemptAt) return;
      const delay = Math.max(DEBOUNCE_MS, s.nextAttemptAt - Date.now());
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void doReconcile();
      }, delay);
    };

    const doReconcile = async () => {
      const uid = userIdRef.current;
      if (!uid || !enabledRef.current) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        useSyncStore.getState().setStatus("offline");
        return;
      }
      if (isOutboxOnLegacyKey()) {
        useSyncStore.getState().setStatus("error", "Sync requiere un workspace activo.");
        useSyncStore.getState().refreshPendingFromOutbox();
        return;
      }
      if (!canAttemptOutboxNow()) {
        useSyncStore.getState().refreshPendingFromOutbox();
        scheduleBackoffTimer();
        return;
      }
      if (pushInFlightRef.current) return;
      pushInFlightRef.current = true;
      useSyncStore.getState().setStatus("syncing");
      try {
        const local = useDbStore.getState().db;
        const { db: norm, changed } = normalizeIds(omitDeniedToolWrites(local));
        if (changed) {
          suspendRef.current = true;
          suspendCloudPersist(true);
          useDbStore.getState().replaceDb({
            ...norm,
            settings: mergeSettingsForWorkspace(
              local.settings,
              norm.settings,
              workspaceIdRef.current,
            ),
            pendingDeletes: local.pendingDeletes,
          });
          suspendRef.current = false;
          suspendCloudPersist(false);
        }

        const result = await reconcileViaApi(useDbStore.getState().db);
        const remote = result?.data;
        if (result?.partial && Array.isArray(result.rejected) && result.rejected.length) {
          const localNow = useDbStore.getState().db;
          if (remote) {
            const merged = mergeSyncDatabases(localNow, remote, {
              localSettings: localNow.settings,
              workspaceId: workspaceIdRef.current,
              visibilityPurge: true,
            });
            applyRemote(merged, { clearPendingDeletes: false });
          }
          recordOutboxRejected(result.rejected);
          useSyncStore.getState().refreshPendingFromOutbox();
          const after = getOutboxState();
          if (after.dirty) {
            useSyncStore.getState().setStatus(
              "error",
              "Algunos cambios no se pudieron sincronizar; se reintentará.",
            );
            scheduleBackoffTimer();
          } else {
            useSyncStore.getState().setSynced();
          }
        } else {
          if (remote) applyRemote(remote, { clearPendingDeletes: true });
          ackClean();
          useSyncStore.getState().setSynced();
        }
      } catch (err) {
        const code = err && typeof err === "object" ? err.code || err.status : null;
        recordOutboxFailure(code);
        useSyncStore.getState().refreshPendingFromOutbox();
        useSyncStore.getState().setStatus("error", err instanceof Error ? err.message : String(err));
        scheduleBackoffTimer();
      } finally {
        pushInFlightRef.current = false;
      }
    };

    const scheduleSync = () => {
      markDirty("mutation");
      if (!enabledRef.current) return;
      if (isOutboxOnLegacyKey()) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      const s = getOutboxState();
      const delay =
        s.nextAttemptAt && s.nextAttemptAt > Date.now()
          ? Math.max(DEBOUNCE_MS, s.nextAttemptAt - Date.now())
          : DEBOUNCE_MS;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void doReconcile();
      }, delay);
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
        const result = await recoverLocalBlobToCloud({ cloudDb: opts.cloudDb });
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
      if (!uid || !enabledRef.current) return;
      if (refreshInFlightRef.current) {
        pendingRefreshOptsRef.current = { ...opts, force: true };
        return;
      }
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
            workspaceId: workspaceIdRef.current,
            visibilityPurge: true,
          });
          suspendRef.current = true;
          suspendCloudPersist(true);
          useDbStore.getState().replaceDb(merged);
          suspendRef.current = false;
          suspendCloudPersist(false);
        }

        if (needsPush || isOutboxDirty() || hasPendingDeletes(useDbStore.getState().db)) {
          await doReconcile();
        } else {
          useSyncStore.getState().setSynced();
        }
      } catch (err) {
        try {
          await hydrateProspectsFromApi();
          useSyncStore.getState().setSynced();
        } catch {
          useSyncStore.getState().setStatus(
            "error",
            err instanceof Error ? err.message : String(err),
          );
        }
      } finally {
        refreshInFlightRef.current = false;
        const pending = pendingRefreshOptsRef.current;
        pendingRefreshOptsRef.current = null;
        if (pending) {
          void refreshInbound(pending);
        }
      }
    };

    registerSyncRefresh(refreshInbound);
    registerSyncPush(flushOutbound);

    const onWorkspaceChanged = () => {
      clearOutboxBackoff();
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
      clearOutboxBackoff();
      useSyncStore.getState().refreshPendingFromOutbox();

      let account = typeof window !== "undefined" ? localStorage.getItem(ACCOUNT_KEY) : null;
      if (account && account !== userId) {
        // Dispositivo compartido: el blob local pertenece a otro usuario.
        // Se descarta antes de cualquier merge/push para no mezclar datos entre cuentas.
        resetLocalCrmState();
        account = null;
      }
      const sessionWorkspaceId = workspaceIdRef.current;
      if (sessionWorkspaceId && sessionWorkspaceId !== getActiveWorkspaceId()) {
        applyWorkspaceLocalDatabase(sessionWorkspaceId);
      }
      let localDb = loadDatabase();
      const hadLocalToRecover = !isEmptyDb(localDb) || isOutboxDirty();

      let cloudDb;
      try {
        cloudDb = await pullViaApi();
      } catch (err) {
        enabledRef.current = true;
        localDb = loadDatabase();
        // Fallback: /sync puede fallar (504) pero GET /prospects sigue operativo.
        try {
          await hydrateProspectsFromApi();
          useSyncStore.getState().setSynced();
          await runLocalRecovery({ force: true, reason: "init-sync-fallback" });
          startRealtime(userId);
          return;
        } catch {
          /* continuar con flujo offline-push */
        }
        const canPushLocal =
          (account === userId || !account) && (!isEmptyDb(localDb) || isOutboxDirty());
        if (canPushLocal) {
          try {
            const { db: norm } = normalizeIds(localDb);
            applyRemote(norm);
            clearOutboxBackoff();
            enabledRef.current = true;
            await doReconcile();
            localStorage.setItem(ACCOUNT_KEY, userId);
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
          workspaceId: workspaceIdRef.current,
          visibilityPurge: true,
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
      if (hadLocalToRecover) {
        await runLocalRecovery({ force: true, reason: "init", cloudDb });
      }
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
      const wsId = session?.workspace_activo_id || session?.workspace_activo?.id || null;
      workspaceIdRef.current = wsId;
      if (userId && wsId && wsId !== getActiveWorkspaceId()) {
        applyWorkspaceLocalDatabase(wsId);
      }
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
      const isPrefs = event.key === USER_PREFS_KEY;
      if ((!isCurrentWorkspaceStorageEvent(event.key) && !isPrefs) || !event.newValue) return;
      if (!enabledRef.current || suspendRef.current) return;
      try {
        const next = loadDatabase();
        suspendRef.current = true;
        suspendCloudPersist(true);
        useDbStore.getState().replaceDb(next);
        suspendRef.current = false;
        suspendCloudPersist(false);
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
