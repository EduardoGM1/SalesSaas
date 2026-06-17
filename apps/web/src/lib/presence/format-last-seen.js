/**
 * Formato de "última vez visto" según reglas de negocio.
 * @param {string|Date|null} iso
 * @param {string} lang
 * @param {(key: string, vars?: object) => string} t
 */
export function formatLastSeen(iso, lang, t) {
  if (!iso) return null;
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date();
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);

  if (diffMin < 60) {
    return t("network.lastSeenMinutes", { n: Math.max(1, diffMin) });
  }

  const locale = lang === "en" ? "en-US" : "es-MX";
  const timeStr = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  const today = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today) {
    return t("network.lastSeenToday", { time: timeStr });
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return t("network.lastSeenYesterday", { time: timeStr });
  }

  const daysDiff = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (daysDiff >= 2) {
    return date.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  return date.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
}
