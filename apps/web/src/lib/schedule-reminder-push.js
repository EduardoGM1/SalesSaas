import { notificationsApi } from "@/lib/notifications-api.js";
import { isSupabaseConfigured } from "@/lib/supabase/config";

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
 * Silencioso si falla (no bloquea el guardado local).
 */
export function scheduleReminderPush({
  type,
  date,
  time,
  note,
  entryKey,
}) {
  if (!isSupabaseConfigured()) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  if (!date) return;

  const sendAt = localReminderToIso(date, time);
  if (!sendAt) return;

  const cleanNote = String(note || "")
    .replace(/^\d{1,2}:\d{2}\s*·\s*/, "")
    .trim();

  void notificationsApi
    .scheduleReminder({
      type,
      date,
      time: time || "09:00",
      note: cleanNote,
      send_at: sendAt,
      entry_key: entryKey || String(Date.now()),
    })
    .catch((err) => {
      console.warn("[reminder-push] No se pudo programar:", err?.message || err);
    });
}
