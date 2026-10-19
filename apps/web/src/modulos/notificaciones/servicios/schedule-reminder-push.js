import { notificationsApi } from "../api/notifications-api.js";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { toast } from "./toast";
import { fechaHoraLocalAIso, armarProgramacionRecordatorio } from "../fachada-node.js";

/** @deprecated nombre legacy — usa fechaHoraLocalAIso (dominio). */
export function localReminderToIso(dateStr, timeStr) {
  return fechaHoraLocalAIso(dateStr, timeStr);
}

/**
 * Programa push OneSignal a la hora del follow-up / nota.
 * Mismo canal que mensajes (external_id + subscription_ids en API).
 */
export function scheduleReminderPush({
  type,
  date,
  time,
  note,
  entryKey,
}) {
  if (!isSupabaseConfigured()) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    toast.error("Sin conexión: no se pudo programar el aviso push.");
    return;
  }
  const payload = armarProgramacionRecordatorio({ type, date, time, note, entryKey }, Date.now());
  if (!payload) return;

  void notificationsApi
    .scheduleReminder(payload)
    .then((result) => {
      if (result?.skipped === "prefs_off") {
        toast.error("Activa los recordatorios en Configuración → Notificaciones y guarda.");
      }
      // Sin toast de éxito: solo debe llegar el push a la hora programada.
    })
    .catch((err) => {
      console.warn("[reminder-push] No se pudo programar:", err?.message || err);
      toast.error(
        err instanceof Error
          ? err.message
          : "No se pudo programar el aviso push.",
      );
    });
}
