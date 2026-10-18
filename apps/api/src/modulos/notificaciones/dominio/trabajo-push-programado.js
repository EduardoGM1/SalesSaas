/**
 * Validación / selección pura previa a insert en scheduled_push_jobs.
 * Sin DB ni OneSignal.
 */
import { PushType, calendarPath } from "./mapeo-pushtype.js";

/**
 * @param {string} kind
 * @returns {{ esFollow: boolean, esNota: boolean } | { error: string }}
 */
export function clasificarTipoRecordatorio(kind) {
  const k = String(kind ?? "").trim();
  const esFollow = k === "follow-up" || k === "follow";
  const esNota = k === "note" || k === "nota" || k === "scheduled_note";
  if (!esFollow && !esNota) {
    return { error: "Tipo de recordatorio no válido." };
  }
  return { esFollow, esNota };
}

/** @param {string} date */
export function fechaRecordatorioValida(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(date ?? "").trim());
}

/** @param {string} timeRaw */
export function normalizarHoraRecordatorio(timeRaw) {
  const t = String(timeRaw ?? "").trim();
  return /^\d{1,2}:\d{2}$/.test(t) ? t.padStart(5, "0") : "09:00";
}

/**
 * @param {unknown} sendAtRaw
 * @param {number} [nowMs]
 * @returns {{ ok: true, sendAt: Date } | { ok: false, skipped?: string, error?: string }}
 */
export function evaluarSendAt(sendAtRaw, nowMs = Date.now()) {
  const sendAt = sendAtRaw ? new Date(String(sendAtRaw)) : null;
  if (!sendAt || Number.isNaN(sendAt.getTime())) {
    return { ok: false, error: "send_at inválido." };
  }
  const delta = sendAt.getTime() - nowMs;
  if (delta < -2 * 60 * 60 * 1000) {
    return { ok: false, skipped: "too_late" };
  }
  return { ok: true, sendAt };
}

/**
 * Campos de la fila pendiente (sin user_id / insert).
 * @param {{ esFollow: boolean, date: string, time: string, note: string, entryKey: string, tag: string }} p
 */
export function construirCamposTrabajoPush(p) {
  const { esFollow, date, time, note, entryKey, tag } = p;
  const pushType = esFollow ? PushType.FOLLOW_UP_REMINDER : PushType.SCHEDULED_NOTE;
  const path = calendarPath();
  const title = esFollow ? "Recordatorio de follow-up" : "Nota programada";
  const preview = note
    ? (note.length > 120 ? `${note.slice(0, 120)}…` : note)
    : (esFollow ? "Tienes un follow-up programado" : "Tienes una nota programada");
  const bodyText = esFollow
    ? (note ? `Follow-up: ${preview}` : `Follow-up a las ${time}`)
    : (note ? `Nota: ${preview}` : `Nota programada a las ${time}`);
  return {
    push_type: pushType,
    title,
    body: bodyText,
    path,
    tag,
    entry_key: entryKey,
    status: "pending",
    date,
    time,
  };
}
