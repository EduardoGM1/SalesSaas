import { useEffect } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isPushSupported, syncPushSubscription } from "@/lib/push-notifications.js";

/** Sincroniza la suscripción push del navegador con el servidor al iniciar sesión. */
export function PushSync() {
  useEffect(() => {
    if (!isSupabaseConfigured() || !isPushSupported()) return undefined;
    if (Notification.permission !== "granted") return undefined;

    let cancelled = false;
    const run = async () => {
      try {
        await syncPushSubscription();
      } catch {
        // Sin suscripción activa o servidor sin VAPID.
      }
      if (cancelled) return;
    };

    const timer = window.setTimeout(run, 2_000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return null;
}
