import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  ensureOneSignal,
  linkOneSignalUser,
  resolveOneSignalAppId,
  restorePushSubscriptionIfNeeded,
  setupPushNotificationHandlers,
  unlinkOneSignalUser,
} from "@/lib/onesignal.js";
import { registerDeviceSubscription, syncPushSubscription } from "@/lib/push-notifications.js";
import { scheduleAutoPushRequest } from "@/lib/push-enable.js";

/** Inicializa OneSignal y vincula el usuario de Supabase como external_id. */
export function OneSignalProvider({ children }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isSupabaseConfigured()) return undefined;

    let authSubscription = null;
    let pushSubscriptionListener = null;
    let oneSignalInstance = null;
    let cancelled = false;

    const setup = async () => {
      try {
        const appId = await resolveOneSignalAppId();
        if (!appId || cancelled) return;

        oneSignalInstance = await ensureOneSignal();
        if (cancelled) return;

        await setupPushNotificationHandlers({ onNavigate: navigate });
        if (cancelled) return;

        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        let activeUserId = user?.id ?? null;

        const syncIdentity = async (userId) => {
          if (!userId || cancelled) return;
          await linkOneSignalUser(userId);
          await restorePushSubscriptionIfNeeded();
          await syncPushSubscription();
        };

        if (activeUserId) {
          await syncIdentity(activeUserId);
        }

        pushSubscriptionListener = async () => {
          if (!activeUserId || cancelled || !oneSignalInstance) return;
          const subscriptionId = oneSignalInstance.User.PushSubscription.id || null;
          if (subscriptionId) {
            await linkOneSignalUser(activeUserId);
            await registerDeviceSubscription(subscriptionId);
            return;
          }
          await syncIdentity(activeUserId);
        };
        oneSignalInstance.User.PushSubscription.addEventListener("change", pushSubscriptionListener);

        authSubscription = supabase.auth.onAuthStateChange(async (event, session) => {
          activeUserId = session?.user?.id ?? null;
          if (session?.user?.id) {
            await syncIdentity(session.user.id);
            if (event === "SIGNED_IN") {
              scheduleAutoPushRequest({ reason: "signed-in", delayMs: 900 });
            }
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
      if (oneSignalInstance && pushSubscriptionListener) {
        oneSignalInstance.User.PushSubscription.removeEventListener("change", pushSubscriptionListener);
      }
    };
  }, [navigate]);

  return children;
}
