import { clientDisplayName } from "@/lib/clients";
import { translate } from "@/lib/i18n.js";
import { useDbStore } from "@/stores/db-store";
import { toast } from "@/lib/toast";
import { scheduleReminderPush } from "@/lib/schedule-reminder-push.js";

export function saveClientNote({ clientId, client, noteForm }) {
  if (!noteForm.note.trim()) {
    toast.error(translate("toast.note.empty"));
    return { ok: false };
  }
  const date = noteForm.date || noteForm.fallbackDate;
  const time = noteForm.time || "";
  const fullNote = time ? `${time} · ${noteForm.note}` : noteForm.note;
  const title = noteForm.type === "follow" ? "Follow-up" : noteForm.type === "pendiente" ? "Pendiente" : "Nota";
  const store = useDbStore.getState();
  const ts = Date.now();
  store.addClientActivity(clientId, {
    type: noteForm.type,
    date,
    title,
    note: fullNote,
    source: "Clientes",
  });
  if (noteForm.date) {
    const entryType = noteForm.type === "follow" ? "follow" : "nota";
    store.addCalEntryByDate(date, {
      t: entryType,
      note: fullNote,
      time: time || undefined,
      clientId,
      prospectId: client.prospectId,
      clientName: clientDisplayName(client),
      ts,
      source: "client-note",
    });
    if (entryType === "follow" || entryType === "nota") {
      scheduleReminderPush({
        type: entryType === "follow" ? "follow-up" : "note",
        date,
        time: time || undefined,
        note: noteForm.note,
        entryKey: ts,
      });
    }
  }
  return { ok: true };
}

export function saveAgendaUserNote({ dateStr, year, month, day, nota, remDate, remTime }) {
  const trimmed = nota.trim();
  if (!trimmed) {
    toast.error(translate("toast.agenda.empty"));
    return { ok: false };
  }
  const time = remTime || "";
  const note = time ? `${time} · ${trimmed}` : trimmed;
  const store = useDbStore.getState();
  const ts = Date.now();
  const entry = { t: "nota", ts, note, time: time || undefined };
  store.addUserActivity({
    type: "nota",
    date: dateStr,
    title: "Nota del usuario",
    note,
    source: "Agenda",
  });
  const targetDate = remDate
    || `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (remDate) store.addCalEntryByDate(remDate, entry);
  else store.addCalEntry(year, month, day, entry);

  scheduleReminderPush({
    type: "note",
    date: targetDate,
    time: time || undefined,
    note: trimmed,
    entryKey: ts,
  });
  return { ok: true };
}

export function saveAgendaDayOff({ year, month, day }) {
  const store = useDbStore.getState();
  store.addCalEntry(year, month, day, { t: "descanso", ts: Date.now(), note: "Día de descanso" });
  return { ok: true };
}

export function saveAgendaNoTour({ year, month, day, note }) {
  const store = useDbStore.getState();
  store.addCalEntry(year, month, day, {
    t: "nota",
    kind: "no-tour",
    ts: Date.now(),
    note: note?.trim() || translate("entry.noTour.defaultNote"),
    source: "no-tour",
  });
  return { ok: true };
}
