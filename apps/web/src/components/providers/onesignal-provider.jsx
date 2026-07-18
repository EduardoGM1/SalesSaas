import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  diagnosePushSubscription,
  ensureOneSignal,
  resolveOneSignalAppId,
  restorePushSubscriptionIfNeeded,
  setupPushNotificationHandlers,
  syncPushIdentityAndSubscription,
  unlinkOneSignalUser,
} from "@/lib/onesignal.js";
import { scheduleAutoPushRequest } from "@/lib/push-enable.js";
import { clearAutoPushRequested } from "@/lib/push-prompt.js";
import { bindNotificationSoundUnlock } from "@/lib/notification-sound.js";

/** Inicializa OneSignal y vincula el usuario de Supabase como external_id. */
export function OneSignalProvider({ children }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isSupabaseConfigured()) return undefined;

    let authSubscription = null;
    let pushSubscriptionListener = null;
    let oneSignalInstance = null;
    let cancelled = false;
    let activeUserId = null;

    bindNotificationSoundUnlock();

    // Diagnóstico manual en consola: await __diagnosePush()
    window.__diagnosePush = diagnosePushSubscription;

    const resyncOnResume = () => {
      if (!activeUserId || cancelled) return;
      void syncPushIdentityAndSubscription();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") resyncOnResume();
    };

    window.addEventListener("auth:resume", resyncOnResume);
    document.addEventListener("visibilitychange", onVisibility);

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
        activeUserId = user?.id ?? null;

        const syncIdentity = async (userId) => {
          if (!userId || cancelled) return;
          await syncPushIdentityAndSubscription();
        };

        if (activeUserId) {
          await syncIdentity(activeUserId);
        }

        pushSubscriptionListener = async () => {
          if (!activeUserId || cancelled) return;
          await syncPushIdentityAndSubscription();
        };
        oneSignalInstance.User.PushSubscription.addEventListener("change", pushSubscriptionListener);

        authSubscription = supabase.auth.onAuthStateChange(async (event, session) => {
          activeUserId = session?.user?.id ?? null;
          if (session?.user?.id) {
            await syncIdentity(session.user.id);
            if (event === "SIGNED_IN") {
              const permission = typeof Notification !== "undefined" ? Notification.permission : "default";
              // Permiso ya concedido (caso desktop needsResync): restaurar en segundo plano,
              // sin competir con el botón «Activar» ni generar toasts.
              if (permission === "granted") {
                void restorePushSubscriptionIfNeeded().then((result) => {
                  if (result?.restored || result?.alreadySubscribed) {
                    window.dispatchEvent(new CustomEvent("push:status-changed"));
                  }
                });
                return;
              }
              if (permission === "default") {
                // Chrome/Edge exigen gesto de usuario: limpiar flag y pedir en el próximo pointerdown
                // (AutoPushCoordinator). Banner visible como CTA si el usuario no interactúa aún.
                clearAutoPushRequested();
                scheduleAutoPushRequest({ reason: "signed-in", delayMs: 500, preferBanner: true });
              }
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
      if (window.__diagnosePush === diagnosePushSubscription) {
        delete window.__diagnosePush;
      }
      authSubscription?.unsubscribe();
      window.removeEventListener("auth:resume", resyncOnResume);
      document.removeEventListener("visibilitychange", onVisibility);
      if (oneSignalInstance && pushSubscriptionListener) {
        oneSignalInstance.User.PushSubscription.removeEventListener("change", pushSubscriptionListener);
      }
    };
  }, [navigate]);

  return children;
}
