import { notificationsApi } from "@/lib/notifications-api.js";

const LOCAL_COOLDOWN_KEY = "sts4_reminder_digest_at";
/** Evita martillar el endpoint al cambiar de pestaña; el servidor tiene su propio cooldown. */
const LOCAL_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Pide al backend el digest / catch-up de recordatorios operativos.
 * Los avisos con hora exacta se programan aparte al guardar (schedule-reminder).
 */
export function maybeRequestReminderDigest() {
  if (typeof window === "undefined") return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  const now = Date.now();
  try {
    const last = Number(localStorage.getItem(LOCAL_COOLDOWN_KEY) || 0);
    if (Number.isFinite(last) && now - last < LOCAL_COOLDOWN_MS) return;
  } catch {
    // ignore
  }

  void notificationsApi
    .digestReminders({
      timezone_offset_minutes: new Date().getTimezoneOffset(),
    })
    .then((data) => {
      const skip = data?.skipped;
      if (skip === "prefs_off" || skip === "not_configured" || skip === "no_user") return;
      try {
        localStorage.setItem(LOCAL_COOLDOWN_KEY, String(now));
      } catch {
        // ignore
      }
    })
    .catch(() => {
      // Silencioso: no bloquear sync ni UX.
    });
}
