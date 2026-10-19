import { construirRecordatorios as collectReminders } from "../dominio/construir-recordatorios.js";
import * as syncService from "../../../services/sync-service.js";

export async function getReminders(supabase, userId, { from, to } = {}) {
  const db = await syncService.obtenerBaseDatosUsuario(supabase, userId);
  return collectReminders(db, { from, to });
}
