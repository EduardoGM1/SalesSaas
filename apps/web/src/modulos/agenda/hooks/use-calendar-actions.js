import { useCallback } from "react";
import {
  guardarDescanso,
  guardarNotaCliente,
  guardarNotaUsuario,
  guardarSinTour,
} from "../servicios/acciones-agenda.js";

/** Hook de acciones de agenda (UI). Alias: useAccionesAgenda. */
export function useCalendarActions() {
  const saveNoteForClient = useCallback((args) => guardarNotaCliente(args), []);
  const saveUserNote = useCallback((args) => guardarNotaUsuario(args), []);
  const saveDayOff = useCallback((args) => guardarDescanso(args), []);
  const saveNoTour = useCallback((args) => guardarSinTour(args), []);

  return { saveNoteForClient, saveUserNote, saveDayOff, saveNoTour };
}

export const useAccionesAgenda = useCalendarActions;
