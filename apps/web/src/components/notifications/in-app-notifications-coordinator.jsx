import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getInstallPlatform } from "@/lib/pwa-install.js";
import {
  startInAppNotificationsRealtime,
  stopInAppNotificationsRealtime,
} from "@/lib/in-app-notifications-realtime.js";

/** Toasts sociales en desktop vía Realtime (independiente del permiso push). */
export function InAppNotificationsCoordinator() {
  useEffect(() => {
    if (!isSupabaseConfigured()) return undefined;
    if (getInstallPlatform() !== "desktop") return undefined;

    let cancelled = false;
    const supabase = createClient();

    const sync = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user?.id) {
        await stopInAppNotificationsRealtime();
        return;
      }
      await startInAppNotificationsRealtime(user.id);
    };

    void sync();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (session?.user?.id) void startInAppNotificationsRealtime(session.user.id);
      else void stopInAppNotificationsRealtime();
    });

    const onResume = () => {
      if (!cancelled) void sync();
    };
    window.addEventListener("auth:resume", onResume);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") onResume();
    });

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
      window.removeEventListener("auth:resume", onResume);
      void stopInAppNotificationsRealtime();
    };
  }, []);

  return null;
}
