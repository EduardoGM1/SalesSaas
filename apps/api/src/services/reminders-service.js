import { collectReminders } from "../lib/reminders.js";
import * as syncService from "./sync-service.js";

export async function getReminders(supabase, userId, { from, to } = {}) {
  const db = await syncService.pullUserDatabase(supabase, userId);
  return collectReminders(db, { from, to });
}
