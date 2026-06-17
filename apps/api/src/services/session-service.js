import { ServiceError } from "../lib/service-error.js";

export async function getSession(supabase, userId) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, phone, avatar_url, settings, is_super_admin, admin_permissions, user_permissions")
    .eq("id", userId)
    .single();
  return {
    user: user ? { id: user.id, email: user.email } : null,
    profile: profile ?? null,
  };
}

export async function getRealtimeSession(supabase) {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw new ServiceError(error.message, 500);
  if (!session?.access_token) throw new ServiceError("Sin sesión activa.", 401);
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
  };
}
