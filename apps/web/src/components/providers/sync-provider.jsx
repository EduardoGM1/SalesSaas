
import { useEffect, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isEmptyDb, normalizeIds } from "@/lib/data/mappers";
import { pullViaApi, reconcileViaApi } from "@/lib/sync-api.js";
import { loadDatabase } from "@/lib/storage/local-storage-adapter";
import { emptyDatabase } from "@/lib/storage/types";
import { useDbStore } from "@/stores/db-store";
import { useSyncStore } from "@/stores/sync-store";
import { Toaster } from "@/components/ui/toaster";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const ACCOUNT_KEY = "sts4_account";
const DEBOUNCE_MS = 1200;

export function SyncProvider({ children }: { children }) {
  const sbRef = useRef<SupabaseClient | null>(null);
  const userIdRef = useRef<string | null>(null);
  const suspendRef = useRef(false);
  const enabledRef = useRef(false);
  const initedForRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      useSyncStore.getState().setStatus("disabled");
      return;
    }

    const sb = createClient();
    sbRef.current = sb;

    const applyRemote = (db: ReturnType<typeof emptyDatabase>) => {
      suspendRef.current = true;
      useDbStore.getState().replaceDb(db);
      suspendRef.current = false;
    };

    const doReconcile = async () => {
      const sbc = sbRef.current;
      const uid = userIdRef.current;
      if (!sbc || !uid || !enabledRef.current) return;
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
        // Sin conexión o error: conservamos el estado local y reintentaremos.
        useSyncStore.getState().setStatus("offline", err instanceof Error ? err.message : undefined);
        enabledRef.current = true;
        return;
      }

      if (!isEmptyDb(cloudDb)) {
        // La nube manda: reemplaza la caché local.
        applyRemote(cloudDb);
        localStorage.setItem(ACCOUNT_KEY, userId);
        useSyncStore.getState().setSynced();
      } else if (account === userId) {
        // Misma cuenta, nube vacía: recuperamos lo local.
        const { db: norm } = normalizeIds(localDb);
        applyRemote(norm);
        if (!isEmptyDb(norm)) await reconcileViaApi(norm);
        useSyncStore.getState().setSynced();
      } else if (!account && !isEmptyDb(localDb)) {
        // Primer login: migramos los datos locales previos a esta cuenta.
        const { db: norm } = normalizeIds(localDb);
        applyRemote(norm);
        await reconcileViaApi(norm);
        localStorage.setItem(ACCOUNT_KEY, userId);
        useSyncStore.getState().setSynced();
      } else {
        // Cuenta distinta sin datos en la nube: empezamos limpio.
        applyRemote(emptyDatabase());
        localStorage.setItem(ACCOUNT_KEY, userId);
        useSyncStore.getState().setSynced();
      }

      enabledRef.current = true;
    };

    // Sesión inicial
    sb.auth.getUser().then(({ data }) => {
      if (data.user) void initForUser(data.user.id);
    });

    // Cambios de sesión
    const { data: authSub } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        enabledRef.current = false;
        initedForRef.current = null;
        userIdRef.current = null;
        useSyncStore.getState().setStatus("disabled");
        return;
      }
      if (session?.user) void initForUser(session.user.id);
    });

    // Suscripción a cambios del estado local -> push con debounce
    const unsub = useDbStore.subscribe((state, prev) => {
      if (state.db === prev.db) return;
      if (suspendRef.current || !enabledRef.current) return;
      scheduleSync();
    });

    const onOnline = () => void doReconcile();
    window.addEventListener("online", onOnline);

    return () => {
      authSub.subscription.unsubscribe();
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
