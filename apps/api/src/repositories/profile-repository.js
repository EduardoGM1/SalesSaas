/**
 * Persistencia de perfil. El merge de settings.workspaces lo hace el service.
 */
import { ServiceError } from "../lib/service-error.js";

const PROFILE_SELECT = "id, email, full_name, role, phone, avatar_url, settings, created_at, updated_at";

export async function obtenerPerfilPorId(supabase, userId) {
  const { data, error } = await supabase.from("profiles").select(PROFILE_SELECT).eq("id", userId).single();
  if (error) throw new ServiceError(error.message, 500);
  return data;
}

export async function obtenerNombreYSettings(supabase, userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, settings")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  return data;
}

export async function actualizarPerfilPorId(supabase, userId, patch) {
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select(PROFILE_SELECT)
    .single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function actualizarPresenciaOffline(supabase, userId, lastSeenAt) {
  const { data, error } = await supabase
    .from("profiles")
    .update({ last_seen_at: lastSeenAt })
    .eq("id", userId)
    .select("id, last_seen_at")
    .single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}
