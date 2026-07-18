import { useEffect } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config.js";
import { enablePushNotifications, scheduleAutoPushRequest } from "@/lib/push-enable.js";
import {
  clearAutoPushRequested,
  wasAutoPushRequested,
  wasPushPromptPermanentlyBlocked,
} from "@/lib/push-prompt.js";
import { getInstallPlatform } from "@/lib/pwa-install.js";
import { unlockNotificationSound } from "@/lib/notification-sound.js";

/**
 * Dispara el permiso nativo en el mismo gesto del usuario (pointerdown),
 * no tras setTimeout — Chrome/Edge ignoran requestPermission sin user activation.
 */
export function AutoPushCoordinator() {
  useEffect(() => {
    if (!isSupabaseConfigured()) return undefined;

    const onAuthChanged = () => {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        void enablePushNotifications();
        return;
      }
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        clearAutoPushRequested();
      }
      // Tras login: banner; el pointerdown siguiente abre el diálogo nativo (gesto real).
      scheduleAutoPushRequest({ reason: "auth-changed", delayMs: 600, preferBanner: true });
    };

    const onFirstInteraction = () => {
      window.removeEventListener("pointerdown", onFirstInteraction, true);
      void unlockNotificationSound();

      if (wasPushPromptPermanentlyBlocked()) return;

      // Recuperar flag basura del bug anterior (marcado sin haber pedido permiso).
      if (
        wasAutoPushRequested()
        && typeof Notification !== "undefined"
        && Notification.permission === "default"
      ) {
        clearAutoPushRequested();
      }

      // Desktop: si el permiso ya está granted tras login, completar suscripción OneSignal.
      if (
        getInstallPlatform() === "desktop"
        && typeof Notification !== "undefined"
        && Notification.permission === "granted"
      ) {
        void enablePushNotifications();
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
