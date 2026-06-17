import { ServiceError } from "../lib/service-error.js";

const PROFILE_SELECT = "id, email, full_name, role, phone, avatar_url, settings, created_at, updated_at";

export async function getProfile(supabase, userId) {
  const { data, error } = await supabase.from("profiles").select(PROFILE_SELECT).eq("id", userId).single();
  if (error) throw new ServiceError(error.message, 500);
  return data;
}

export function buildProfilePatch(body) {
  const patch = {};
  if (body.full_name !== undefined || body.fullName !== undefined) patch.full_name = body.full_name ?? body.fullName;
  if (body.phone !== undefined) patch.phone = body.phone;
  if (body.avatar_url !== undefined || body.avatarUrl !== undefined) patch.avatar_url = body.avatar_url ?? body.avatarUrl;
  if (body.settings !== undefined && typeof body.settings === "object" && !Array.isArray(body.settings)) {
    patch.settings = body.settings;
  }
  if (!Object.keys(patch).length) throw new ServiceError("Sin campos para actualizar.");
  return patch;
}

export async function updateProfile(supabase, userId, body) {
  const patch = buildProfilePatch(body);
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select(PROFILE_SELECT)
    .single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function markPresenceOffline(supabase, userId) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("profiles")
    .update({ last_seen_at: now })
    .eq("id", userId)
    .select("id, last_seen_at")
    .single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}
