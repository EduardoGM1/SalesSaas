import { useEffect } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config.js";
import { scheduleAutoPushRequest } from "@/lib/push-enable.js";
import { restorePushSubscriptionIfNeeded } from "@/lib/onesignal.js";
import {
  clearAutoPushRequested,
  wasAutoPushRequested,
  wasPushPromptPermanentlyBlocked,
} from "@/lib/push-prompt.js";
import { getInstallPlatform } from "@/lib/pwa-install.js";
import { unlockNotificationSound } from "@/lib/notification-sound.js";

function isExplicitPushEnableTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("[data-push-enable]"));
}

/**
 * Dispara el permiso nativo en el mismo gesto del usuario (pointerdown),
 * no tras setTimeout — Chrome/Edge ignoran requestPermission sin user activation.
 */
export function AutoPushCoordinator() {
  useEffect(() => {
    if (!isSupabaseConfigured()) return undefined;

    const onAuthChanged = () => {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        // Silencioso: no competir con el botón «Activar» ni apilar toasts.
        void restorePushSubscriptionIfNeeded().then((result) => {
          if (result?.restored || result?.alreadySubscribed) {
            window.dispatchEvent(new CustomEvent("push:status-changed"));
          }
        });
        return;
      }
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        clearAutoPushRequested();
      }
      // Tras login: banner; el pointerdown siguiente abre el diálogo nativo (gesto real).
      scheduleAutoPushRequest({ reason: "auth-changed", delayMs: 600, preferBanner: true });
    };

    const onFirstInteraction = (event) => {
      window.removeEventListener("pointerdown", onFirstInteraction, true);
      void unlockNotificationSound();

      if (wasPushPromptPermanentlyBlocked()) return;

      // El botón «Activar notificaciones» maneja su propio enable + toast.
      if (isExplicitPushEnableTarget(event?.target)) return;

      // Recuperar flag basura del bug anterior (marcado sin haber pedido permiso).
      if (
        wasAutoPushRequested()
        && typeof Notification !== "undefined"
        && Notification.permission === "default"
      ) {
        clearAutoPushRequested();
      }

      // Desktop: permiso granted → completar suscripción en segundo plano (sin toast).
      if (
        getInstallPlatform() === "desktop"
        && typeof Notification !== "undefined"
        && Notification.permission === "granted"
      ) {
        void restorePushSubscriptionIfNeeded().then((result) => {
          if (result?.restored || result?.alreadySubscribed) {
            window.dispatchEvent(new CustomEvent("push:status-changed"));
          }
        });
        return;
      }

      if (wasAutoPushRequested()) return;

      // delayMs=0: requestPermission corre en el stack del gesto.
      scheduleAutoPushRequest({ reason: "first-interaction", delayMs: 0 });
    };

    window.addEventListener("auth:changed", onAuthChanged);
    window.addEventListener("pointerdown", onFirstInteraction, true);

    return () => {
      window.removeEventListener("auth:changed", onAuthChanged);
      window.removeEventListener("pointerdown", onFirstInteraction, true);
    };
  }, []);

  return null;
}
