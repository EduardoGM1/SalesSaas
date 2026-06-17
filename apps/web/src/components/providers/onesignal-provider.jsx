import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  ensureOneSignal,
  isOneSignalConfigured,
  linkOneSignalUser,
  unlinkOneSignalUser,
} from "@/lib/onesignal.js";

/** Inicializa OneSignal y vincula el usuario de Supabase como external_id. */
export function OneSignalProvider({ children }) {
  useEffect(() => {
    if (!isSupabaseConfigured() || !isOneSignalConfigured()) return undefined;

    let authSubscription = null;
    let cancelled = false;

    const setup = async () => {
      try {
        await ensureOneSignal();
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
        // SDK no disponible o sin App ID.
      }
    };

    setup();

    return () => {
      cancelled = true;
      authSubscription?.unsubscribe();
    };
  }, []);

  return children;
}
