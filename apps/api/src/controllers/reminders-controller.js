/**
 * Recordatorios derivados del blob de sync del usuario.
 */
import * as remindersService from "../services/reminders-service.js";

export async function listarRecordatorios(auth, req) {
  const from = req.query.from ? String(req.query.from) : undefined;
  const to = req.query.to ? String(req.query.to) : undefined;
  return remindersService.getReminders(auth.supabase, auth.userId, { from, to });
}
