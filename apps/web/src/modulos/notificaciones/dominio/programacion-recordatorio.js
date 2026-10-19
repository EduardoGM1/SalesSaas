import { fechaHoraLocalAIso } from "./fecha-recordatorio-local.js";

/**
 * Cuerpo de POST /notifications/schedule-reminder (contrato sin cambio).
 * @returns {{ type: string, date: string, time: string, note: string, send_at: string, entry_key: string } | null}
 */
export function armarProgramacionRecordatorio({ type, date, time, note, entryKey }, ahoraMs) {
  if (!date) return null;

  const sendAt = fechaHoraLocalAIso(date, time);
  if (!sendAt) return null;

  const cleanNote = String(note || "")
    .replace(/^\d{1,2}:\d{2}\s*·\s*/, "")
    .trim();
  const displayTime = /^\d{1,2}:\d{2}$/.test(String(time || "").trim())
    ? String(time).trim().padStart(5, "0")
    : "09:00";

  return {
    type,
    date,
    time: displayTime,
    note: cleanNote,
    send_at: sendAt,
    entry_key: entryKey || String(ahoraMs),
  };
}
