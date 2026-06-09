export async function getSession(supabase, userId) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, phone, avatar_url, settings, is_super_admin, admin_permissions")
    .eq("id", userId)
    .single();
  return {
    user: user ? { id: user.id, email: user.email } : null,
    profile: profile ?? null,
  };
}
