import { notificationsApi } from "@/lib/notifications-api.js";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { toast } from "@/lib/toast";
import { translate } from "@/lib/i18n.js";

/**
 * Convierte fecha+hora local del dispositivo a ISO absoluto.
 * @param {string} dateStr YYYY-MM-DD
 * @param {string} [timeStr] HH:MM — si falta, 09:00
 */
export function localReminderToIso(dateStr, timeStr) {
  const date = String(dateStr || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const time = /^\d{1,2}:\d{2}$/.test(String(timeStr || "").trim())
    ? String(timeStr).trim().padStart(5, "0")
    : "09:00";
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
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
    toast.error(translate("settings.help.sentError") === "No se pudo enviar la solicitud."
      ? "Sin conexión: no se pudo programar el aviso push."
      : "Offline: could not schedule push reminder.");
    return;
  }
  if (!date) return;

  const sendAt = localReminderToIso(date, time);
  if (!sendAt) return;

  const cleanNote = String(note || "")
    .replace(/^\d{1,2}:\d{2}\s*·\s*/, "")
    .trim();
  const displayTime = /^\d{1,2}:\d{2}$/.test(String(time || "").trim())
    ? String(time).trim().padStart(5, "0")
    : "09:00";

  void notificationsApi
    .scheduleReminder({
      type,
      date,
      time: displayTime,
      note: cleanNote,
      send_at: sendAt,
      entry_key: entryKey || String(Date.now()),
    })
    .then((result) => {
      if (result?.skipped === "prefs_off") {
        toast.error(
          "Los recordatorios están desactivados en Configuración → Notificaciones.",
        );
        return;
      }
      if (result?.skipped === "too_late") return;
      if (result?.scheduled) {
        toast.success(`Aviso push programado para las ${displayTime}.`);
      } else if (result?.ok) {
        toast.success("Aviso push enviado.");
      }
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
