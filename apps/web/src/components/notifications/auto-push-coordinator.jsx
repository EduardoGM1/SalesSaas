import { useEffect } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config.js";
import { scheduleAutoPushRequest } from "@/lib/push-enable.js";
import {
  clearAutoPushRequested,
  wasAutoPushRequested,
  wasPushPromptPermanentlyBlocked,
} from "@/lib/push-prompt.js";
import { unlockNotificationSound } from "@/lib/notification-sound.js";

/**
 * Dispara el permiso nativo en el mismo gesto del usuario (pointerdown),
 * no tras setTimeout — Chrome/Edge ignoran requestPermission sin user activation.
 */
export function AutoPushCoordinator() {
  useEffect(() => {
    if (!isSupabaseConfigured()) return undefined;

    const onAuthChanged = () => {
      // Tras login no hay gesto fiable → banner con botón (el click sí tiene gesto).
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
