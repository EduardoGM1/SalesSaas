import { isUuid } from "@salesapp/shared/data/mappers.js";
import { bodyToToolUpsert } from "@salesapp/shared/api/validators.js";
import { ServiceError } from "../lib/service-error.js";
import { notifyProspectSectionChanged } from "./push-notifications-service.js";

const SECTION_TOOLS = new Set(["survey", "vacaciones", "worksheet"]);

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

  if (data?.prospect_id && SECTION_TOOLS.has(data.tool)) {
    notifyOwnerToolCollaborators(supabase, {
      actorId: userId,
      prospectId: data.prospect_id,
      section: data.tool,
    }).catch((err) => console.warn("[tools] push section:", err?.message || err));
  }

  return data;
}

async function notifyOwnerToolCollaborators(supabase, { actorId, prospectId, section }) {
  const { data: shares } = await supabase
    .from("prospect_shares")
    .select("shared_with_id, owner_id")
    .eq("prospect_id", prospectId);
  const rows = shares ?? [];
  if (!rows.length) return;

  const ownerId = rows[0]?.owner_id || actorId;
  const recipientIds = [ownerId, ...rows.map((r) => r.shared_with_id)].filter(Boolean);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", actorId)
    .maybeSingle();
  const actorName = profile?.full_name?.trim() || profile?.email?.split("@")[0] || "Alguien";

  await notifyProspectSectionChanged({
    actorId,
    actorName,
    prospectId,
    ownerId,
    section,
    recipientIds,
  });
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
