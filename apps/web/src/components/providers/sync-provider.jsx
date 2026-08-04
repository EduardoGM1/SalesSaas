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
import { recoverLocalProspectsToCloud } from "@/lib/recover-local-prospects.js";
import { maybeRequestReminderDigest, maybeFlushScheduledReminders, startScheduledReminderFlushLoop } from "@/lib/reminder-digest.js";
import { useDbStore } from "@/stores/db-store";
import { useSyncStore } from "@/stores/sync-store";
import { Toaster } from "@/components/ui/toaster";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const ACCOUNT_KEY = "sts4_account";
const DEBOUNCE_MS = 1200;
/** Cooldown al volver a primer plano (PWA y Desktop). Realtime usa force=true. */
const RESUME_PULL_COOLDOWN_MS = 5_000;
/** Reintento de recuperación de expedientes solo-locales. */
const RECOVERY_COOLDOWN_MS = 15_000;

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
  /** Mutaciones locales pendientes de PUT (sobrevive a cancelar el debounce en PWA). */
  const dirtyOutboundRef = useRef(false);
  const lastRecoveryAtRef = useRef(0);
  const stopFlushLoopRef = useRef(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      useSyncStore.getState().setStatus("disabled");
      return;
    }

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
        dirtyOutboundRef.current = false;
        useSyncStore.getState().setSynced();
      } catch (err) {
        // Conservar dirty para reintentar en el próximo resume/online.
        dirtyOutboundRef.current = true;
        useSyncStore.getState().setStatus("error", err instanceof Error ? err.message : String(err));
      } finally {
        pushInFlightRef.current = false;
      }
    };

    const scheduleSync = () => {
      dirtyOutboundRef.current = true;
      if (!enabledRef.current) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void doReconcile();
      }, DEBOUNCE_MS);
    };

    /** Push inmediato (crear expediente, etc.). */
    const flushOutbound = async () => {
      dirtyOutboundRef.current = true;
      if (!enabledRef.current) return;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      await doReconcile();
    };

    /**
     * Rescata expedientes atrapados en localStorage del dispositivo → BD.
     * POST faltantes + PUT sync completo.
     */
    const runLocalRecovery = async (opts = {}) => {
      const force = opts.force === true;
      if (!enabledRef.current) return null;
      if (typeof navigator !== "undefined" && !navigator.onLine) return null;
      const now = Date.now();
      if (!force && now - lastRecoveryAtRef.current < RECOVERY_COOLDOWN_MS) return null;
      lastRecoveryAtRef.current = now;
      useSyncStore.getState().setStatus("syncing");
      try {
        const result = await recoverLocalProspectsToCloud();
        if (result.reconciled) dirtyOutboundRef.current = false;
        else if (result.localOnlyIds?.length || result.failed?.length) {
          dirtyOutboundRef.current = true;
        }
        if (result.error && !result.reconciled) {
          useSyncStore.getState().setStatus("error", result.error);
        } else {
          useSyncStore.getState().setSynced();
        }
        return result;
      } catch (err) {
        dirtyOutboundRef.current = true;
        useSyncStore.getState().setStatus(
          "error",
          err instanceof Error ? err.message : String(err),
        );
        return null;
      }
    };

    /**
     * Pull inbound seguro multi-dispositivo:
     * 1) merge nube + local (LWW / filas solo locales)
     * 2) si hay cambios locales / dirty / solo-locales → PUT
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

      const hadPendingOutbound = !!timerRef.current || dirtyOutboundRef.current;
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
          || dirtyOutboundRef.current
          || hasPendingDeletes(localBefore);

        if (cloudDb) {
          // Releer local tras el await (pudo mutar durante el pull).
          const local = useDbStore.getState().db;
          needsPush =
            needsPush
            || dirtyOutboundRef.current
            || localNeedsOutboundPush(local, cloudDb);
          const merged = mergeSyncDatabases(local, cloudDb, {
            localSettings: local.settings,
          });
          suspendRef.current = true;
          useDbStore.getState().replaceDb(merged);
          suspendRef.current = false;
        }

        if (needsPush || dirtyOutboundRef.current || hasPendingDeletes(useDbStore.getState().db)) {
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

      const account = typeof window !== "undefined" ? localStorage.getItem(ACCOUNT_KEY) : null;
      // Snapshot fresco; se relee otra vez tras el pull.
      let localDb = loadDatabase();

      let cloudDb;
      try {
        cloudDb = await pullViaApi();
      } catch (err) {
        enabledRef.current = true;
        localDb = loadDatabase();
        const canPushLocal =
          (account === userId || !account) && !isEmptyDb(localDb);
        if (canPushLocal) {
          try {
            const { db: norm } = normalizeIds(localDb);
            const remote = await reconcileViaApi(norm);
            if (remote) applyRemote(remote, { clearPendingDeletes: true });
            else applyRemote(norm);
            dirtyOutboundRef.current = false;
            localStorage.setItem(ACCOUNT_KEY, userId);
            useSyncStore.getState().setSynced();
            await runLocalRecovery({ force: true, reason: "init-offline-push" });
            startRealtime(userId);
            return;
          } catch (syncErr) {
            dirtyOutboundRef.current = true;
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

      // Local actualizado tras el await (crea durante init no se pierden).
      localDb = useDbStore.getState().db;
      if (isEmptyDb(localDb)) localDb = loadDatabase();

      if (!isEmptyDb(cloudDb)) {
        const merged = mergeSyncDatabases(localDb, cloudDb, {
          localSettings: localDb.settings,
        });
        applyRemote(merged, { clearPendingDeletes: !hasPendingDeletes(localDb) });
        localStorage.setItem(ACCOUNT_KEY, userId);
        const mustPush =
          dirtyOutboundRef.current
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
        if (!isEmptyDb(norm) || dirtyOutboundRef.current) {
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
      // Si hubo mutaciones durante init, subirlas ya.
      if (dirtyOutboundRef.current) {
        await doReconcile();
      }
      // Rescate: expedientes solo en el teléfono → POST + PUT a la BD.
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
      dirtyOutboundRef.current = false;
      if (typeof stopFlushLoopRef.current === "function") {
        stopFlushLoopRef.current();
        stopFlushLoopRef.current = null;
      }
      void stopDashboardDataRealtime();
      useSyncStore.getState().setStatus("disabled");
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
      // Marca dirty aunque sync aún no esté enabled (crea durante init).
      dirtyOutboundRef.current = true;
      if (!enabledRef.current) return;
      scheduleSync();
    });

    const onOnline = () => {
      lastResumePullAtRef.current = 0;
      const uid = userIdRef.current;
      if (uid) {
        void ensureDashboardDataRealtime(uid, {
          force: true,
          workspaceId: workspaceIdRef.current,
        });
      }
      void (async () => {
        await runLocalRecovery({ force: true, reason: "online" });
        await refreshInbound({ reason: "online", force: true });
      })();
    };

    /** PWA y Desktop: rearmar Realtime + pull forzado al volver a primer plano. */
    const onAppForeground = () => {
      if (document.visibilityState && document.visibilityState !== "visible") return;
      const uid = userIdRef.current;
      if (!uid || !enabledRef.current) return;
      void ensureDashboardDataRealtime(uid, {
        force: true,
        workspaceId: workspaceIdRef.current,
      });
      void (async () => {
        // Primero subir lo atrapado en el teléfono; luego pull+merge.
        await runLocalRecovery({ reason: "foreground" });
        await refreshInbound({ reason: "foreground", force: true });
      })();
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
