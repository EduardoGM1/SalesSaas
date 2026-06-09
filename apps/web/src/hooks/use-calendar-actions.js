import { useCallback } from "react";
import { saveAgendaDayOff, saveAgendaUserNote, saveClientNote } from "@/actions/calendar.js";

export function useCalendarActions() {
  const saveNoteForClient = useCallback((args) => saveClientNote(args), []);
  const saveUserNote = useCallback((args) => saveAgendaUserNote(args), []);
  const saveDayOff = useCallback((args) => saveAgendaDayOff(args), []);

  return { saveNoteForClient, saveUserNote, saveDayOff };
}
