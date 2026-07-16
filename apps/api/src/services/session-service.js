import { ServiceError } from "../lib/service-error.js";
import { getCurrentMembership, listPremiumFeatures } from "./membership-service.js";

export async function getSession(supabase, userId) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, phone, avatar_url, settings, is_super_admin, admin_permissions, user_permissions")
    .eq("id", userId)
    .single();

  let membership = {
    plan: "basico",
    status: "activa",
    fecha_inicio: null,
    fecha_proximo_cobro: null,
  };
  let premiumFeatures = [];
  try {
    membership = await getCurrentMembership(supabase, userId);
    premiumFeatures = await listPremiumFeatures(supabase);
  } catch {
    // Si la migración aún no está aplicada, no tumbar la sesión.
  }

  const enriched = profile
    ? {
        ...profile,
        plan: membership.plan,
        membership_status: membership.status,
        membership_fecha_inicio: membership.fecha_inicio,
        membership_fecha_proximo_cobro: membership.fecha_proximo_cobro,
      }
    : null;

  return {
    user: user ? { id: user.id, email: user.email } : null,
    profile: enriched,
    membership,
    premiumFeatures,
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
