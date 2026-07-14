import { notificationsApi } from "@/lib/notifications-api.js";

const LOCAL_COOLDOWN_KEY = "sts4_reminder_digest_at";
const LOCAL_FLUSH_KEY = "sts4_reminder_flush_at";
/** Evita martillar el digest; el servidor tiene su propio cooldown. */
const LOCAL_COOLDOWN_MS = 15 * 60 * 1000;
/** Flush de jobs a hora exacta: cada ~45s mientras la app esté abierta. */
const LOCAL_FLUSH_MS = 45_000;

/**
 * Pide al backend el digest / catch-up de recordatorios operativos.
 * Los avisos con hora exacta van por cola scheduled_push_jobs + flush.
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
    .catch(() => {});
}

/** Descarga follow-ups/notas cuya hora ya llegó (envío inmediato tipo mensaje). */
export function maybeFlushScheduledReminders({ force = false } = {}) {
  if (typeof window === "undefined") return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  const now = Date.now();
  if (!force) {
    try {
      const last = Number(localStorage.getItem(LOCAL_FLUSH_KEY) || 0);
      if (Number.isFinite(last) && now - last < LOCAL_FLUSH_MS) return;
    } catch {
      // ignore
    }
  }

  try {
    localStorage.setItem(LOCAL_FLUSH_KEY, String(now));
  } catch {
    // ignore
  }

  void notificationsApi.flushReminders().catch(() => {});
}

/** Arranca poll de flush mientras la sesión esté activa. */
export function startScheduledReminderFlushLoop() {
  if (typeof window === "undefined") return () => {};

  maybeFlushScheduledReminders({ force: true });
  const id = window.setInterval(() => {
    if (document.visibilityState && document.visibilityState !== "visible") return;
    maybeFlushScheduledReminders();
  }, LOCAL_FLUSH_MS);

  const onVisible = () => {
    if (document.visibilityState === "visible") {
      maybeFlushScheduledReminders({ force: true });
    }
  };
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    window.clearInterval(id);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
