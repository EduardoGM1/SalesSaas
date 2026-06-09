
import { useEffect, useRef } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isEmptyDb, normalizeIds } from "@/lib/data/mappers";
import { pullViaApi, reconcileViaApi } from "@/lib/sync-api.js";
import { loadDatabase } from "@/lib/storage/local-storage-adapter";
import { emptyDatabase } from "@/lib/storage/types";
import { watchSession } from "@/lib/session-api.js";
import { useDbStore } from "@/stores/db-store";
import { useSyncStore } from "@/stores/sync-store";
import { Toaster } from "@/components/ui/toaster";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const ACCOUNT_KEY = "sts4_account";
const DEBOUNCE_MS = 1200;

export function SyncProvider({ children }) {
  const userIdRef = useRef(null);
  const suspendRef = useRef(false);
  const enabledRef = useRef(false);
  const initedForRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      useSyncStore.getState().setStatus("disabled");
      return;
    }

    const applyRemote = (db) => {
      suspendRef.current = true;
      useDbStore.getState().replaceDb(db);
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
        await reconcileViaApi(useDbStore.getState().db);
        useSyncStore.getState().setSynced();
      } catch (err) {
        useSyncStore.getState().setStatus("error", err instanceof Error ? err.message : String(err));
      }
    };

    const scheduleSync = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(doReconcile, DEBOUNCE_MS);
    };

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
        useSyncStore.getState().setStatus("offline", err instanceof Error ? err.message : undefined);
        enabledRef.current = true;
        return;
      }

      if (!isEmptyDb(cloudDb)) {
        applyRemote(cloudDb);
        localStorage.setItem(ACCOUNT_KEY, userId);
        useSyncStore.getState().setSynced();
      } else if (account === userId) {
        const { db: norm } = normalizeIds(localDb);
        applyRemote(norm);
        if (!isEmptyDb(norm)) await reconcileViaApi(norm);
        useSyncStore.getState().setSynced();
      } else if (!account && !isEmptyDb(localDb)) {
        const { db: norm } = normalizeIds(localDb);
        applyRemote(norm);
        await reconcileViaApi(norm);
        localStorage.setItem(ACCOUNT_KEY, userId);
        useSyncStore.getState().setSynced();
      } else {
        applyRemote(emptyDatabase());
        localStorage.setItem(ACCOUNT_KEY, userId);
        useSyncStore.getState().setSynced();
      }

      enabledRef.current = true;
    };

    const stopForUser = () => {
      enabledRef.current = false;
      initedForRef.current = null;
      userIdRef.current = null;
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

    const onOnline = () => void doReconcile();
    window.addEventListener("online", onOnline);

    return () => {
      unsubSession();
      unsub();
      window.removeEventListener("online", onOnline);
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
