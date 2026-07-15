import { useEffect } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config.js";
import { scheduleAutoPushRequest } from "@/lib/push-enable.js";
import { wasAutoPushRequested } from "@/lib/push-prompt.js";

/**
 * Dispara el permiso nativo tras interacción real (login o primer toque en la app),
 * no en carga en frío sin gesto del usuario.
 */
export function AutoPushCoordinator() {
  useEffect(() => {
    if (!isSupabaseConfigured()) return undefined;

    const onAuthChanged = () => {
      if (wasAutoPushRequested()) return;
      scheduleAutoPushRequest({ reason: "auth-changed", delayMs: 900 });
    };

    const onFirstInteraction = () => {
      if (wasAutoPushRequested()) return;
      scheduleAutoPushRequest({ reason: "first-interaction", delayMs: 400 });
      window.removeEventListener("pointerdown", onFirstInteraction, true);
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
