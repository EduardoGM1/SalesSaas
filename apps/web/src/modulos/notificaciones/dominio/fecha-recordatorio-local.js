/**
 * Convierte fecha+hora local del dispositivo a ISO absoluto (puro).
 * @param {string} dateStr YYYY-MM-DD
 * @param {string} [timeStr] HH:MM — si falta, 09:00
 */
export function fechaHoraLocalAIso(dateStr, timeStr) {
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
