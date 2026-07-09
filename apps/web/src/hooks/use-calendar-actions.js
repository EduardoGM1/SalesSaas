import { useCallback } from "react";
import { saveAgendaDayOff, saveAgendaNoTour, saveAgendaUserNote, saveClientNote } from "@/actions/calendar.js";

export function useCalendarActions() {
  const saveNoteForClient = useCallback((args) => saveClientNote(args), []);
  const saveUserNote = useCallback((args) => saveAgendaUserNote(args), []);
  const saveDayOff = useCallback((args) => saveAgendaDayOff(args), []);
  const saveNoTour = useCallback((args) => saveAgendaNoTour(args), []);

  return { saveNoteForClient, saveUserNote, saveDayOff, saveNoTour };
}
