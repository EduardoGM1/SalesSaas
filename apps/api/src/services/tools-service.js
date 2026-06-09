import { isUuid } from "@salesapp/shared/data/mappers.js";
import { bodyToToolUpsert } from "@salesapp/shared/api/validators.js";
import { ServiceError } from "../lib/service-error.js";

export async function getToolCalculation(supabase, userId, tool, prospectId) {
  if (!tool) throw new ServiceError("tool requerido.");
  let q = supabase.from("tool_calculations").select("*").eq("user_id", userId).eq("tool", tool);
  if (prospectId === "libre" || prospectId === null || prospectId === undefined) {
    q = q.is("prospect_id", null);
  } else if (isUuid(prospectId)) {
    q = q.eq("prospect_id", prospectId);
  } else {
    throw new ServiceError("prospect_id inválido.");
  }
  const { data, error } = await q.maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  return data ?? null;
}

export async function upsertToolCalculation(supabase, userId, body) {
  const row = bodyToToolUpsert(body, userId);
  if (!row) throw new ServiceError("tool y data son requeridos.");
  const { data, error } = await supabase.from("tool_calculations").upsert(row, { onConflict: "user_id,prospect_id,tool" }).select().single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function deleteToolCalculation(supabase, userId, tool, prospectId) {
  if (!tool) throw new ServiceError("tool requerido.");
  let q = supabase.from("tool_calculations").delete().eq("user_id", userId).eq("tool", tool);
  if (prospectId === "libre") q = q.is("prospect_id", null);
  else if (isUuid(prospectId)) q = q.eq("prospect_id", prospectId);
  else throw new ServiceError("prospect_id inválido.");
  const { error } = await q;
  if (error) throw new ServiceError(error.message, 400);
  return { ok: true };
}
