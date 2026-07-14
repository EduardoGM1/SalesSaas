import { notificationsApi } from "@/lib/notifications-api.js";

const LOCAL_DAY_KEY = "sts4_reminder_digest_day";

/**
 * Pide al backend el digest de recordatorios operativos (máx. 1 intento local/día).
 * El servidor aplica cooldown propio por tipo.
 */
export function maybeRequestReminderDigest() {
  if (typeof window === "undefined") return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  const today = new Date().toISOString().slice(0, 10);
  try {
    if (localStorage.getItem(LOCAL_DAY_KEY) === today) return;
  } catch {
    // ignore
  }

  void notificationsApi
    .digestReminders()
    .then((data) => {
      const skip = data?.skipped;
      if (skip === "prefs_off" || skip === "not_configured" || skip === "no_user") return;
      try {
        localStorage.setItem(LOCAL_DAY_KEY, today);
      } catch {
        // ignore
      }
    })
    .catch(() => {
      // Silencioso: no bloquear sync ni UX.
    });
}
