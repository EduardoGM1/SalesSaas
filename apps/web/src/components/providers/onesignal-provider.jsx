import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  ensureOneSignal,
  linkOneSignalUser,
  resolveOneSignalAppId,
  setupPushNotificationHandlers,
  unlinkOneSignalUser,
} from "@/lib/onesignal.js";

/** Inicializa OneSignal y vincula el usuario de Supabase como external_id. */
export function OneSignalProvider({ children }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isSupabaseConfigured()) return undefined;

    let authSubscription = null;
    let cancelled = false;

    const setup = async () => {
      try {
        const appId = await resolveOneSignalAppId();
        if (!appId || cancelled) return;

        await ensureOneSignal();
        if (cancelled) return;

        await setupPushNotificationHandlers({ onNavigate: navigate });
        if (cancelled) return;

        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) await linkOneSignalUser(user.id);

        authSubscription = supabase.auth.onAuthStateChange(async (event, session) => {
          if (session?.user?.id) {
            await linkOneSignalUser(session.user.id);
          } else if (event === "SIGNED_OUT") {
            await unlinkOneSignalUser();
          }
        }).data.subscription;
      } catch {
        // SDK no disponible o OneSignal sin configurar en servidor.
      }
    };

    setup();

    return () => {
      cancelled = true;
      authSubscription?.unsubscribe();
    };
  }, [navigate]);

  return children;
}
