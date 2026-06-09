import { bodyToGoalUpsert } from "@salesapp/shared/api/validators.js";
import { ServiceError } from "../lib/service-error.js";

export async function listGoals(supabase, userId, year) {
  let q = supabase.from("goals").select("*").eq("user_id", userId);
  if (year) q = q.eq("year", Number(year));
  const { data, error } = await q;
  if (error) throw new ServiceError(error.message, 500);
  return data ?? [];
}

export async function upsertGoal(supabase, userId, body) {
  const row = bodyToGoalUpsert(body, userId);
  if (!row) throw new ServiceError("year y month son requeridos.");
  const { data, error } = await supabase.from("goals").upsert(row, { onConflict: "user_id,year,month" }).select().single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function deleteGoal(supabase, userId, year, month) {
  if (!year || month < 0 || month > 11) throw new ServiceError("year y month requeridos.");
  const { error } = await supabase.from("goals").delete().eq("user_id", userId).eq("year", year).eq("month", month);
  if (error) throw new ServiceError(error.message, 400);
  return { ok: true };
}
