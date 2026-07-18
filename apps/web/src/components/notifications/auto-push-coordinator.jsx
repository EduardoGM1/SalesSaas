import { useEffect } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config.js";
import { scheduleAutoPushRequest } from "@/lib/push-enable.js";
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
 *
 * Desktop con permiso granted: NO auto-restore aquí (el provider hace 1×/sesión;
 * el botón «Activar» es el camino explícito).
 */
export function AutoPushCoordinator() {
  useEffect(() => {
    if (!isSupabaseConfigured()) return undefined;

    const onAuthChanged = () => {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        // Desktop: sin restore en cascada. Móvil: el provider/sync cubre vínculo.
        return;
      }
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        clearAutoPushRequested();
      }
      scheduleAutoPushRequest({ reason: "auth-changed", delayMs: 600, preferBanner: true });
    };

    const onFirstInteraction = (event) => {
      window.removeEventListener("pointerdown", onFirstInteraction, true);
      void unlockNotificationSound();

      if (wasPushPromptPermanentlyBlocked()) return;
      if (isExplicitPushEnableTarget(event?.target)) return;

      if (
        wasAutoPushRequested()
        && typeof Notification !== "undefined"
        && Notification.permission === "default"
      ) {
        clearAutoPushRequested();
      }

      // Desktop + granted: no competir con el botón; Realtime cubre app abierta.
      if (
        getInstallPlatform() === "desktop"
        && typeof Notification !== "undefined"
        && Notification.permission === "granted"
      ) {
        return;
      }

      if (wasAutoPushRequested()) return;

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
