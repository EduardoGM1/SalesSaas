import { pullAll } from "@salesapp/shared/data/sync.js";
import { collectReminders } from "../lib/reminders.js";

export async function getReminders(supabase, userId, { from, to } = {}) {
  const db = await pullAll(supabase, userId);
  return collectReminders(db, { from, to });
}
