import { clientDisplayName } from "@/lib/clients";
import { translate } from "@/lib/i18n.js";
import { useDbStore } from "@/stores/db-store";
import { toast } from "@/lib/toast";

export function saveClientNote({ clientId, client, noteForm }) {
  if (!noteForm.note.trim()) {
    toast.error(translate("toast.note.empty"));
    return { ok: false };
  }
  const date = noteForm.date || noteForm.fallbackDate;
  const fullNote = noteForm.time ? `${noteForm.time} · ${noteForm.note}` : noteForm.note;
  const title = noteForm.type === "follow" ? "Follow-up" : noteForm.type === "pendiente" ? "Pendiente" : "Nota";
  const store = useDbStore.getState();
  store.addClientActivity(clientId, {
    type: noteForm.type,
    date,
    title,
    note: fullNote,
    source: "Clientes",
  });
  if (noteForm.date) {
    store.addCalEntryByDate(date, {
      t: noteForm.type === "follow" ? "follow" : "nota",
      note: fullNote,
      clientId,
      prospectId: client.prospectId,
      clientName: clientDisplayName(client),
      ts: Date.now(),
      source: "client-note",
    });
  }
  return { ok: true };
}

export function saveAgendaUserNote({ dateStr, year, month, day, nota, remDate, remTime }) {
  const trimmed = nota.trim();
  if (!trimmed) {
    toast.error(translate("toast.agenda.empty"));
    return { ok: false };
  }
  const note = remTime ? `${remTime} · ${trimmed}` : trimmed;
  const store = useDbStore.getState();
  const entry = { t: "nota", ts: Date.now(), note };
  store.addUserActivity({
    type: "nota",
    date: dateStr,
    title: "Nota del usuario",
    note,
    source: "Agenda",
  });
  if (remDate) store.addCalEntryByDate(remDate, entry);
  else store.addCalEntry(year, month, day, entry);
  return { ok: true };
}

export function saveAgendaDayOff({ year, month, day }) {
  const store = useDbStore.getState();
  store.addCalEntry(year, month, day, { t: "descanso", ts: Date.now(), note: "Día de descanso" });
  return { ok: true };
}
